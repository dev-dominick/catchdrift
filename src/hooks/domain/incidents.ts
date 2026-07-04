import { RULE_ID } from "@/lib/constants";
import { query, queryOne } from "@/db/sql";
import { deriveSourceFreshness } from "@/domain/freshness";

export async function getIncident(incidentId: string) {
  const incident = await queryOne(
    `select i.*, c.name as campaign_name
     from incidents i
     join campaigns c on c.id = i.campaign_id
     where i.id = $1`,
    [incidentId],
  );

  if (!incident) {
    return null;
  }

  const evidence = await query(
    `select evidence_type, evidence_json, created_at
     from incident_evidence
     where incident_id = $1
     order by created_at asc`,
    [incidentId],
  );

  const events = await query(
    `select event_type, actor_type, details_json, created_at
     from incident_events
     where incident_id = $1
     order by created_at asc`,
    [incidentId],
  );

  const timeline = await query(
    `with latest as (
      select distinct on (metric, interval_start, interval_end)
        metric,
        interval_start,
        interval_end,
        value_decimal,
        source_revision,
        ingested_at
      from metric_observations
      where campaign_id = $1 and maturity = 'mature'
      order by metric, interval_start, interval_end, source_revision desc, ingested_at desc
    )
    select
      interval_start,
      interval_end,
      max(case when metric = 'spend' then value_decimal end)::text as spend,
      max(case when metric = 'paid_clicks' then value_decimal end)::text as paid_clicks,
      max(case when metric = 'sessions' then value_decimal end)::text as sessions,
      max(case when metric = 'internal_submissions' then value_decimal end)::text as internal_submissions,
      max(case when metric = 'attributed_conversions' then value_decimal end)::text as attributed_conversions,
      max(case when metric = 'revenue' then value_decimal end)::text as revenue
    from latest
    group by interval_start, interval_end
    having count(distinct metric) = 6
    order by interval_end asc`,
    [incident.campaign_id],
  );

  const sourceHealth = await query(
    `select source, freshness_state, expected_delay_minutes, last_successful_event_at, latest_mature_interval_end, connector_state
     from source_health
     where workspace_id = $1
     order by source asc`,
    [incident.workspace_id],
  );

  const evaluation = await queryOne<{
    inputs_json: { fresh?: boolean; staleReasons?: string[] };
    suppression_reason: string | null;
    evaluated_at: string;
  }>(
    `select inputs_json, suppression_reason, evaluated_at
     from rule_evaluations
     where campaign_id = $1
       and rule_id = $2
       and evaluated_at <= $3
     order by evaluated_at desc
     limit 1`,
    [incident.campaign_id, RULE_ID, incident.detected_at],
  );

  const now = new Date();
  const derivedSourceHealth = (sourceHealth as Array<Record<string, unknown>>).map((row) => {
    const derived = deriveSourceFreshness(
      {
        source: String(row.source),
        expectedDelayMinutes: Number(row.expected_delay_minutes),
        lastSuccessfulEventAt: row.last_successful_event_at
          ? new Date(String(row.last_successful_event_at))
          : null,
        latestMatureIntervalEnd: row.latest_mature_interval_end
          ? new Date(String(row.latest_mature_interval_end))
          : null,
        connectorState: String(row.connector_state) as "healthy" | "stale" | "failed",
      },
      now,
    );

    return {
      ...row,
      derived_freshness_state: derived.state,
      freshness_label: derived.label,
      overdue_minutes: derived.overdueMinutes,
      suppresses_decisions: derived.suppressesDecisions,
    };
  });

  const deployments = await query(
    `select id, source, external_deployment_id, version, deployed_at, changes_json
     from deployment_events
     where campaign_id = $1
     order by deployed_at desc
     limit 5`,
    [incident.campaign_id],
  );

  const evaluationFreshness = evaluation
    ? {
        fresh: Boolean(evaluation.inputs_json?.fresh),
        staleReasons: Array.isArray(evaluation.inputs_json?.staleReasons)
          ? evaluation.inputs_json.staleReasons
          : [],
        suppressionReason: evaluation.suppression_reason,
        evaluatedAt: evaluation.evaluated_at,
      }
    : null;

  return {
    incident,
    evidence,
    events,
    timeline,
    sourceHealth: derivedSourceHealth,
    evaluationFreshness,
    deployments,
  };
}

export async function updateIncidentStatus(params: {
  incidentId: string;
  action: "acknowledge" | "investigate" | "dismiss" | "resolve";
  actorId?: string;
}): Promise<void> {
  const mapping: Record<typeof params.action, { status: string; eventType: string; ended: boolean }> = {
    acknowledge: { status: "acknowledged", eventType: "acknowledged", ended: false },
    investigate: { status: "investigating", eventType: "investigating", ended: false },
    dismiss: { status: "dismissed", eventType: "dismissed", ended: true },
    resolve: { status: "resolved", eventType: "resolved", ended: true },
  };

  const action = mapping[params.action];

  await query(
    `update incidents
     set status = $2,
         resolved_at = case when $3::boolean then now() else resolved_at end,
         updated_at = now()
     where id = $1`,
    [params.incidentId, action.status, action.ended],
  );

  await query(
    `insert into incident_events (incident_id, event_type, actor_type, actor_id, details_json)
     values ($1, $2, 'user', $3, $4::jsonb)`,
    [params.incidentId, action.eventType, params.actorId ?? "demo-user", JSON.stringify({ action: params.action })],
  );
}