import { addMinutes, differenceInMinutes, formatISO, subMinutes } from "date-fns";
import {
  ACTIVE_INCIDENT_STATUSES,
  DEMO_CAMPAIGN_NAME,
  DEMO_CURRENCY,
  DEMO_EXTERNAL_CAMPAIGN_ID,
  DEMO_TIMEZONE,
  DEMO_WORKSPACE_NAME,
  DEMO_WORKSPACE_SLUG,
  REQUIRED_SOURCES,
  RULE_ID,
  RULE_VERSION,
  SOURCE_EXPECTED_DELAYS_MINUTES,
} from "@/lib/constants";
import { stableHash } from "@/lib/hash";
import { query, queryOne, withTransaction } from "@/db/sql";
import type { Baseline, CorrelationScore, IntervalAggregate } from "@/domain/types";
import { calculateExposureRange, dollarsToMinorUnits } from "@/domain/exposure";
import { scoreDeploymentCandidate, type DeploymentChange } from "@/domain/correlation";
import { evaluateTrackingIntegrityRule } from "@/domain/tracking-rule";
import { deriveSeverity } from "@/domain/severity";
import { deriveSourceFreshness } from "@/domain/freshness";
import type { DeploymentIngestPayload, MetricIngestPayload } from "@/ingestion/contracts";
export { getIncident, updateIncidentStatus } from "@/hooks/domain/incidents";

type WorkspaceRecord = { id: string };
type CampaignRecord = { id: string; workspace_id: string; currency: string; name: string };

type IngestResult = {
  status: "inserted" | "duplicate" | "revised" | "conflict" | "stale_revision";
  campaignId: string;
  workspaceId: string;
};

export async function ensureDemoWorkspaceAndCampaign(): Promise<{
  workspaceId: string;
  campaignId: string;
}> {
  const workspace = await queryOne<WorkspaceRecord>(
    `insert into workspaces (slug, name)
     values ($1, $2)
     on conflict (slug) do update set name = excluded.name, updated_at = now()
     returning id`,
    [DEMO_WORKSPACE_SLUG, DEMO_WORKSPACE_NAME],
  );

  if (!workspace) {
    throw new Error("Failed to upsert demo workspace.");
  }

  const campaign = await queryOne<CampaignRecord>(
    `insert into campaigns (workspace_id, internal_key, name, currency, timezone)
     values ($1, $2, $3, $4, $5)
     on conflict (workspace_id, internal_key)
     do update set name = excluded.name, currency = excluded.currency, timezone = excluded.timezone, updated_at = now()
     returning id, workspace_id, currency, name`,
    [workspace.id, "meta-auto-211", DEMO_CAMPAIGN_NAME, DEMO_CURRENCY, DEMO_TIMEZONE],
  );

  if (!campaign) {
    throw new Error("Failed to upsert demo campaign.");
  }

  await query(
    `insert into external_campaign_mappings (workspace_id, campaign_id, source, external_campaign_id, landing_page_slug, affiliate_sub_id)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (workspace_id, source, external_campaign_id)
     do update set campaign_id = excluded.campaign_id, updated_at = now()`,
    [workspace.id, campaign.id, "meta", DEMO_EXTERNAL_CAMPAIGN_ID, "auto-quote-v3", "meta_auto_211"],
  );

  for (const source of [...REQUIRED_SOURCES, "github"]) {
    await query(
      `insert into external_campaign_mappings (workspace_id, campaign_id, source, external_campaign_id, landing_page_slug, affiliate_sub_id)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (workspace_id, source, external_campaign_id)
       do update set campaign_id = excluded.campaign_id, updated_at = now()`,
      [workspace.id, campaign.id, source, DEMO_EXTERNAL_CAMPAIGN_ID, "auto-quote-v3", "meta_auto_211"],
    );
  }

  return { workspaceId: workspace.id, campaignId: campaign.id };
}

export async function resetDemoWorkspace(): Promise<void> {
  const workspace = await queryOne<WorkspaceRecord>(`select id from workspaces where slug = $1`, [
    DEMO_WORKSPACE_SLUG,
  ]);

  if (!workspace) {
    await ensureDemoWorkspaceAndCampaign();
    return;
  }

  await query(`delete from jobs where workspace_id = $1`, [workspace.id]);
  await query(
    `delete from incident_events where incident_id in (select id from incidents where workspace_id = $1)`,
    [workspace.id],
  );
  await query(
    `delete from incident_evidence where incident_id in (select id from incidents where workspace_id = $1)`,
    [workspace.id],
  );
  await query(`delete from incidents where workspace_id = $1`, [workspace.id]);
  await query(`delete from rule_evaluations where workspace_id = $1`, [workspace.id]);
  await query(`delete from deployment_events where workspace_id = $1`, [workspace.id]);
  await query(`delete from metric_observations where workspace_id = $1`, [workspace.id]);
  await query(`delete from source_health where workspace_id = $1`, [workspace.id]);

  await ensureDemoWorkspaceAndCampaign();
}

async function resolveCampaign(source: string, externalCampaignId: string): Promise<CampaignRecord> {
  const campaign = await queryOne<CampaignRecord>(
    `select c.id, c.workspace_id, c.currency, c.name
     from campaigns c
     join external_campaign_mappings m on m.campaign_id = c.id
     where m.source = $1 and m.external_campaign_id = $2
     limit 1`,
    [source, externalCampaignId],
  );

  if (!campaign) {
    throw new Error("No campaign mapping found for source and external campaign ID.");
  }

  return campaign;
}

async function upsertSourceHealth(params: {
  workspaceId: string;
  source: string;
  lastSuccessfulEventAt: Date;
  latestMatureIntervalEnd: Date | null;
}): Promise<void> {
  const expectedDelay = SOURCE_EXPECTED_DELAYS_MINUTES[params.source] ?? 15;
  const now = new Date();
  const freshnessState =
    differenceInMinutes(now, params.lastSuccessfulEventAt) <= expectedDelay ? "healthy" : "stale";

  await query(
    `insert into source_health (workspace_id, source, expected_delay_minutes, last_successful_event_at, latest_mature_interval_end, freshness_state, connector_state)
     values ($1, $2, $3, $4, $5, $6, 'healthy')
     on conflict (workspace_id, source)
     do update set
       expected_delay_minutes = excluded.expected_delay_minutes,
       last_successful_event_at = excluded.last_successful_event_at,
       latest_mature_interval_end = coalesce(excluded.latest_mature_interval_end, source_health.latest_mature_interval_end),
       freshness_state = excluded.freshness_state,
       connector_state = 'healthy',
       updated_at = now()`,
    [
      params.workspaceId,
      params.source,
      expectedDelay,
      params.lastSuccessfulEventAt,
      params.latestMatureIntervalEnd,
      freshnessState,
    ],
  );
}

async function enqueueEvaluationJob(params: {
  workspaceId: string;
  campaignId: string;
  intervalEnd: Date;
}): Promise<void> {
  const dedupeKey = `${params.campaignId}:${formatISO(params.intervalEnd)}`;

  await query(
    `insert into jobs (workspace_id, type, dedupe_key, payload_json, state, available_at)
     values ($1, 'evaluate_campaign', $2, $3::jsonb, 'pending', now())
     on conflict (workspace_id, type, dedupe_key) do nothing`,
    [
      params.workspaceId,
      dedupeKey,
      JSON.stringify({ campaignId: params.campaignId, intervalEnd: params.intervalEnd.toISOString() }),
    ],
  );
}

export async function ingestMetricObservation(payload: MetricIngestPayload): Promise<IngestResult> {
  const campaign = await resolveCampaign(payload.source, payload.externalCampaignId);

  const normalized = {
    ...payload,
    value: String(payload.value),
    intervalStart: payload.intervalStart,
    intervalEnd: payload.intervalEnd,
  };
  const payloadHash = stableHash(normalized);

  const existing = await queryOne<{ id: string; payload_hash: string }>(
    `select id, payload_hash
     from metric_observations
     where workspace_id = $1 and source = $2 and source_record_id = $3 and source_revision = $4`,
    [campaign.workspace_id, payload.source, payload.sourceRecordId, payload.revision],
  );

  if (existing) {
    if (existing.payload_hash !== payloadHash) {
      return {
        status: "conflict",
        workspaceId: campaign.workspace_id,
        campaignId: campaign.id,
      };
    }

    return {
      status: "duplicate",
      workspaceId: campaign.workspace_id,
      campaignId: campaign.id,
    };
  }

  const priorRevision = await queryOne<{ max_revision: number | null }>(
    `select max(source_revision) as max_revision
     from metric_observations
     where workspace_id = $1 and source = $2 and source_record_id = $3`,
    [campaign.workspace_id, payload.source, payload.sourceRecordId],
  );

  const highestRevision = Number(priorRevision?.max_revision ?? 0);
  if (highestRevision > 0 && payload.revision < highestRevision) {
    return {
      status: "stale_revision",
      workspaceId: campaign.workspace_id,
      campaignId: campaign.id,
    };
  }

  await query(
    `insert into metric_observations (
      workspace_id,
      campaign_id,
      source,
      metric,
      value_decimal,
      currency,
      interval_start,
      interval_end,
      source_record_id,
      source_revision,
      maturity,
      payload_hash
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      campaign.workspace_id,
      campaign.id,
      payload.source,
      payload.metric,
      String(payload.value),
      payload.currency ?? campaign.currency,
      payload.intervalStart,
      payload.intervalEnd,
      payload.sourceRecordId,
      payload.revision,
      payload.maturity,
      payloadHash,
    ],
  );

  await upsertSourceHealth({
    workspaceId: campaign.workspace_id,
    source: payload.source,
    lastSuccessfulEventAt: new Date(),
    latestMatureIntervalEnd:
      payload.maturity === "mature" ? new Date(payload.intervalEnd) : null,
  });

  await enqueueEvaluationJob({
    workspaceId: campaign.workspace_id,
    campaignId: campaign.id,
    intervalEnd: new Date(payload.intervalEnd),
  });

  return {
    status: highestRevision > 0 ? "revised" : "inserted",
    workspaceId: campaign.workspace_id,
    campaignId: campaign.id,
  };
}

export async function ingestDeploymentEvent(payload: DeploymentIngestPayload): Promise<IngestResult> {
  const campaign = await resolveCampaign(payload.source, payload.externalCampaignId);
  const payloadHash = stableHash(payload);

  const existing = await queryOne<{ id: string; payload_hash: string }>(
    `select id, payload_hash from deployment_events
     where workspace_id = $1 and source = $2 and external_deployment_id = $3`,
    [campaign.workspace_id, payload.source, payload.externalDeploymentId],
  );

  if (existing?.payload_hash === payloadHash) {
    return { status: "duplicate", workspaceId: campaign.workspace_id, campaignId: campaign.id };
  }

  if (existing && existing.payload_hash !== payloadHash) {
    const existingDeployment = await queryOne<{ deployed_at: string }>(
      `select deployed_at
       from deployment_events
       where id = $1`,
      [existing.id],
    );

    const existingDeployedAt = existingDeployment ? new Date(existingDeployment.deployed_at).getTime() : null;
    const incomingDeployedAt = new Date(payload.deployedAt).getTime();

    if (existingDeployedAt != null && incomingDeployedAt < existingDeployedAt) {
      return { status: "stale_revision", workspaceId: campaign.workspace_id, campaignId: campaign.id };
    }

    if (existingDeployedAt != null && incomingDeployedAt === existingDeployedAt) {
      return { status: "conflict", workspaceId: campaign.workspace_id, campaignId: campaign.id };
    }

    await query(
      `update deployment_events
       set version = $1,
           deployed_at = $2,
           changes_json = $3::jsonb,
           payload_hash = $4,
           ingested_at = now()
       where id = $5`,
      [payload.version, payload.deployedAt, JSON.stringify(payload.changes), payloadHash, existing.id],
    );

    return { status: "revised", workspaceId: campaign.workspace_id, campaignId: campaign.id };
  }

  await query(
    `insert into deployment_events (workspace_id, campaign_id, source, external_deployment_id, version, deployed_at, changes_json, payload_hash)
     values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)`,
    [
      campaign.workspace_id,
      campaign.id,
      payload.source,
      payload.externalDeploymentId,
      payload.version,
      payload.deployedAt,
      JSON.stringify(payload.changes),
      payloadHash,
    ],
  );

  await upsertSourceHealth({
    workspaceId: campaign.workspace_id,
    source: "deployment_feed",
    lastSuccessfulEventAt: new Date(),
    latestMatureIntervalEnd: null,
  });

  await enqueueEvaluationJob({
    workspaceId: campaign.workspace_id,
    campaignId: campaign.id,
    intervalEnd: new Date(payload.deployedAt),
  });

  return { status: "inserted", workspaceId: campaign.workspace_id, campaignId: campaign.id };
}

function parseIntervalRows(rows: Array<Record<string, unknown>>): IntervalAggregate[] {
  return rows.map((row) => ({
    intervalStart: new Date(String(row.interval_start)),
    intervalEnd: new Date(String(row.interval_end)),
    spend: Number(row.spend),
    paidClicks: Number(row.paid_clicks),
    sessions: Number(row.sessions),
    internalSubmissions: Number(row.internal_submissions),
    attributedConversions: Number(row.attributed_conversions),
    revenue: Number(row.revenue),
  }));
}

async function getMatureIntervals(campaignId: string): Promise<IntervalAggregate[]> {
  const rows = await query(
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
    [campaignId],
  );

  return parseIntervalRows(rows as Array<Record<string, unknown>>);
}

async function computeFreshness(workspaceId: string): Promise<{ healthy: boolean; reasons: string[] }> {
  const records = await query<{
    source: string;
    expected_delay_minutes: number;
    last_successful_event_at: string | null;
    latest_mature_interval_end: string | null;
    connector_state: "healthy" | "stale" | "failed";
  }>(
    `select source, expected_delay_minutes, last_successful_event_at, latest_mature_interval_end, connector_state
     from source_health
     where workspace_id = $1 and source = any($2::text[])`,
    [workspaceId, REQUIRED_SOURCES],
  );

  const bySource = new Map(records.map((r) => [r.source, r]));
  const now = new Date();
  const reasons: string[] = [];

  for (const source of REQUIRED_SOURCES) {
    const record = bySource.get(source);
    const derived = deriveSourceFreshness(
      {
        source,
        expectedDelayMinutes: record?.expected_delay_minutes ?? SOURCE_EXPECTED_DELAYS_MINUTES[source] ?? 5,
        lastSuccessfulEventAt: record?.last_successful_event_at
          ? new Date(record.last_successful_event_at)
          : null,
        latestMatureIntervalEnd: record?.latest_mature_interval_end
          ? new Date(record.latest_mature_interval_end)
          : null,
        connectorState: record?.connector_state ?? "healthy",
      },
      now,
    );

    if (derived.suppressesDecisions) {
      const overdue = derived.overdueMinutes == null ? "" : ` (${derived.overdueMinutes}m overdue)`;
      reasons.push(`${source} source is ${derived.label.toLowerCase()}${overdue}`);
      continue;
    }
  }

  return {
    healthy: reasons.length === 0,
    reasons,
  };
}

function isIntervalCoveredByIncident(interval: IntervalAggregate, incidents: Array<{ detected_at: string; recovered_at: string | null }>): boolean {
  return incidents.some((incident) => {
    const start = new Date(incident.detected_at);
    const end = incident.recovered_at ? new Date(incident.recovered_at) : new Date("9999-12-31T00:00:00.000Z");
    return interval.intervalStart >= start && interval.intervalEnd <= end;
  });
}

async function persistRuleEvaluation(params: {
  workspaceId: string;
  campaignId: string;
  evaluationWindowStart: Date;
  evaluationWindowEnd: Date;
  result: "suppressed" | "normal" | "triggered";
  inputs: unknown;
  baseline: unknown;
  output: unknown;
  suppressionReason?: string;
}): Promise<void> {
  const suppressionReason = params.suppressionReason
    ? params.suppressionReason.slice(0, 160)
    : null;

  await query(
    `insert into rule_evaluations (
      workspace_id,
      campaign_id,
      rule_id,
      rule_version,
      evaluation_window_start,
      evaluation_window_end,
      result,
      inputs_json,
      baseline_json,
      output_json,
      suppression_reason
    ) values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11)`,
    [
      params.workspaceId,
      params.campaignId,
      RULE_ID,
      RULE_VERSION,
      params.evaluationWindowStart,
      params.evaluationWindowEnd,
      params.result,
      JSON.stringify(params.inputs),
      JSON.stringify(params.baseline),
      JSON.stringify(params.output),
      suppressionReason,
    ],
  );
}

async function findActiveIncident(campaignId: string): Promise<{ id: string; status: string } | null> {
  return queryOne(
    `select id, status
     from incidents
     where campaign_id = $1
       and rule_id = $2
       and status = any($3::incident_status[])
     order by detected_at desc
     limit 1`,
    [campaignId, RULE_ID, ACTIVE_INCIDENT_STATUSES],
  );
}

async function evaluateRecovery(params: {
  incidentId: string;
  campaignId: string;
  baseline: Baseline;
  intervals: IntervalAggregate[];
}): Promise<boolean> {
  const current = params.intervals.slice(-3);
  if (current.length < 3) {
    return false;
  }

  const recovered = current.every((i) => {
    const clickLoss = ((i.paidClicks - i.sessions) / i.paidClicks) * 100;
    const attribution = (i.attributedConversions / i.internalSubmissions) * 100;

    const clickRecovered = clickLoss <= params.baseline.clickToSessionLossPct + 4;
    const attrRecovered = attribution >= params.baseline.attributionRatePct * 0.94;
    return clickRecovered && attrRecovered;
  });

  if (!recovered) {
    return false;
  }

  await query(
    `update incidents
     set status = 'recovered', recovered_at = now(), updated_at = now()
     where id = $1 and status = any($2::incident_status[])`,
    [params.incidentId, ACTIVE_INCIDENT_STATUSES],
  );

  await query(
    `insert into incident_events (incident_id, event_type, actor_type, details_json)
     values ($1, 'recovered', 'system', $2::jsonb)`,
    [params.incidentId, JSON.stringify({ reason: "metrics_returned_to_baseline" })],
  );

  return true;
}

async function correlateDeployment(params: {
  campaignId: string;
  degradationStartedAt: Date;
}): Promise<{ deploymentId: string | null; score: CorrelationScore | null; deployment: Record<string, unknown> | null }> {
  const deploymentRows = await query<{
    id: string;
    campaign_id: string;
    deployed_at: string;
    changes_json: DeploymentChange[];
    version: string;
    external_deployment_id: string;
    source: string;
  }>(
    `select id, campaign_id, deployed_at, changes_json, version, external_deployment_id, source
     from deployment_events
     where campaign_id = $1
       and deployed_at between $2 and $3
     order by deployed_at desc`,
    [params.campaignId, subMinutes(params.degradationStartedAt, 90), addMinutes(params.degradationStartedAt, 90)],
  );

  if (deploymentRows.length === 0) {
    return { deploymentId: null, score: null, deployment: null };
  }

  const scores = deploymentRows.map((deployment) => {
    const competing = deploymentRows.filter((other) => {
      if (other.id === deployment.id) {
        return false;
      }

      const distance = Math.abs(
        differenceInMinutes(new Date(other.deployed_at), new Date(deployment.deployed_at)),
      );
      return distance <= 30;
    }).length;

    const score = scoreDeploymentCandidate({
      candidate: {
        id: deployment.id,
        campaignId: deployment.campaign_id,
        deployedAt: new Date(deployment.deployed_at),
        changes: deployment.changes_json,
      },
      degradationStartedAt: params.degradationStartedAt,
      campaignMapped: true,
      campaignHealthyBefore: true,
      competingDeploymentsNearby: competing,
    });

    return { deployment, score };
  });

  scores.sort((a, b) => b.score.total - a.score.total);
  const best = scores[0];

  return {
    deploymentId: best.deployment.id,
    score: best.score,
    deployment: best.deployment,
  };
}

async function createIncident(params: {
  workspaceId: string;
  campaignId: string;
  currency: string;
  baseline: Baseline;
  current: NonNullable<ReturnType<typeof evaluateTrackingIntegrityRule>["current"]>;
  evaluationWindowStart: Date;
  evaluationWindowEnd: Date;
  degradedStreakCount: number;
}): Promise<{ incidentId: string; exposureLabel: string; correlationScore: number | null }> {
  const exposure = calculateExposureRange(params.baseline, params.current);
  const severity = deriveSeverity(exposure);
  const deduplicationKey = `${params.campaignId}:${RULE_ID}:active`;

  const active = await findActiveIncident(params.campaignId);
  if (active) {
    return {
      incidentId: active.id,
      exposureLabel: `$${Math.round(exposure.low)}-$${Math.round(exposure.high)}/hour`,
      correlationScore: null,
    };
  }

  const correlation = await correlateDeployment({
    campaignId: params.campaignId,
    degradationStartedAt: params.evaluationWindowStart,
  });

  const confidence = correlation.score && correlation.score.total >= 80 ? "high" : "medium";

  const evidenceRows = [
    {
      type: "baseline",
      json: params.baseline,
    },
    {
      type: "threshold",
      json: {
        clickLossIncreasePoints: 8,
        attributionDeclinePercent: 12,
        persistenceIntervals: 3,
      },
    },
    {
      type: "metric",
      json: {
        current: params.current,
        degradedStreakCount: params.degradedStreakCount,
        evaluationWindowStart: params.evaluationWindowStart,
        evaluationWindowEnd: params.evaluationWindowEnd,
      },
    },
    {
      type: "deployment",
      json: {
        candidate: correlation.deployment,
        score: correlation.score,
      },
    },
    {
      type: "exposure",
      json: exposure,
    },
  ];

  const incidentId = await withTransaction(async (tx) => {
    const incident = await tx.queryOne<{ id: string }>(
      `insert into incidents (
        workspace_id,
        campaign_id,
        rule_id,
        rule_version,
        deduplication_key,
        severity,
        confidence,
        status,
        exposure_low_minor,
        exposure_high_minor,
        exposure_unit,
        currency,
        detected_at
      ) values ($1,$2,$3,$4,$5,$6,$7,'detected',$8,$9,'hour',$10,now())
      returning id`,
      [
        params.workspaceId,
        params.campaignId,
        RULE_ID,
        RULE_VERSION,
        deduplicationKey,
        severity,
        confidence,
        dollarsToMinorUnits(exposure.low),
        dollarsToMinorUnits(exposure.high),
        params.currency,
      ],
    );

    if (!incident) {
      throw new Error("Failed to create incident.");
    }

    for (const row of evidenceRows) {
      await tx.query(
        `insert into incident_evidence (incident_id, evidence_type, evidence_json, immutable)
         values ($1, $2, $3::jsonb, true)`,
        [incident.id, row.type, JSON.stringify(row.json)],
      );
    }

    await tx.query(
      `insert into incident_events (incident_id, event_type, actor_type, details_json)
       values ($1, 'created', 'system', $2::jsonb)`,
      [
        incident.id,
        JSON.stringify({
          ruleId: RULE_ID,
          ruleVersion: RULE_VERSION,
          degradedStreakCount: params.degradedStreakCount,
        }),
      ],
    );

    return incident.id;
  });

  return {
    incidentId,
    exposureLabel: `$${Math.round(exposure.low)}-$${Math.round(exposure.high)}/hour`,
    correlationScore: correlation.score?.total ?? null,
  };
}

export async function evaluateCampaign(workspaceId: string, campaignId: string): Promise<void> {
  const freshness = await computeFreshness(workspaceId);
  const intervals = await getMatureIntervals(campaignId);

  if (intervals.length === 0) {
    return;
  }

  const openIncidents = await query<{ detected_at: string; recovered_at: string | null }>(
    `select detected_at, recovered_at
     from incidents
     where campaign_id = $1 and status = any($2::incident_status[])
     order by detected_at desc`,
    [campaignId, ACTIVE_INCIDENT_STATUSES],
  );

  const baselineEligibleIntervals = intervals.filter(
    (interval) => !isIntervalCoveredByIncident(interval, openIncidents),
  );

  const result = evaluateTrackingIntegrityRule({
    intervals: baselineEligibleIntervals,
    fresh: freshness.healthy,
    staleReason: freshness.reasons.join("; "),
  });

  const currentWindow = intervals.slice(-3);
  const evaluationWindowStart = currentWindow[0]?.intervalStart ?? intervals[0].intervalStart;
  const evaluationWindowEnd = currentWindow[currentWindow.length - 1]?.intervalEnd ?? intervals[0].intervalEnd;

  await persistRuleEvaluation({
    workspaceId,
    campaignId,
    evaluationWindowStart,
    evaluationWindowEnd,
    result: result.result,
    inputs: {
      intervalsEvaluated: baselineEligibleIntervals.length,
      fresh: freshness.healthy,
      staleReasons: freshness.reasons,
    },
    baseline: result.baseline ?? {},
    output: result,
    suppressionReason: result.suppressionReason,
  });

  const activeIncident = await findActiveIncident(campaignId);
  if (activeIncident && result.baseline) {
    await evaluateRecovery({
      incidentId: activeIncident.id,
      campaignId,
      baseline: result.baseline,
      intervals,
    });
    return;
  }

  if (
    result.result === "triggered" &&
    result.baseline &&
    result.current &&
    typeof result.degradedStreakCount === "number"
  ) {
    const campaign = await queryOne<{ currency: string }>(
      `select currency from campaigns where id = $1`,
      [campaignId],
    );

    if (!campaign) {
      throw new Error("Campaign not found while creating incident.");
    }

    await createIncident({
      workspaceId,
      campaignId,
      currency: campaign.currency,
      baseline: result.baseline,
      current: result.current,
      evaluationWindowStart,
      evaluationWindowEnd,
      degradedStreakCount: result.degradedStreakCount,
    });
  }
}

export async function claimJob(workerId: string): Promise<{
  id: string;
  type: string;
  payload_json: Record<string, unknown>;
  workspace_id: string;
} | null> {
  return claimJobInternal(workerId);
}

export async function claimJobForWorkspace(workerId: string, workspaceId: string): Promise<{
  id: string;
  type: string;
  payload_json: Record<string, unknown>;
  workspace_id: string;
} | null> {
  return claimJobInternal(workerId, workspaceId);
}

async function claimJobInternal(
  workerId: string,
  workspaceId?: string,
): Promise<{
  id: string;
  type: string;
  payload_json: Record<string, unknown>;
  workspace_id: string;
} | null> {
  const rows = await query<{
    id: string;
    type: string;
    payload_json: Record<string, unknown>;
    workspace_id: string;
  }>(
    `with picked as (
      select id
      from jobs
      where state = 'pending'
        and available_at <= now()
        and ($2::uuid is null or workspace_id = $2::uuid)
      order by created_at asc
      for update skip locked
      limit 1
    )
    update jobs j
    set state = 'running',
        attempts = attempts + 1,
        locked_at = now(),
        locked_by = $1,
        updated_at = now()
    from picked
    where j.id = picked.id
    returning j.id, j.type, j.payload_json, j.workspace_id`,
    [workerId, workspaceId ?? null],
  );

  return rows[0] ?? null;
}

export async function completeJob(jobId: string): Promise<void> {
  await query(
    `update jobs
     set state = 'completed', completed_at = now(), updated_at = now()
     where id = $1`,
    [jobId],
  );
}

export async function failJob(jobId: string, error: string): Promise<void> {
  const redacted = error.slice(0, 400);
  await query(
    `update jobs
     set state = case
          when attempts >= max_attempts then 'failed'::job_state
          else 'pending'::job_state
        end,
         available_at = case when attempts >= max_attempts then available_at else now() + interval '30 seconds' end,
         last_error_redacted = $2,
         locked_at = null,
         locked_by = null,
         updated_at = now()
     where id = $1`,
    [jobId, redacted],
  );
}

export async function processJob(job: {
  id: string;
  type: string;
  payload_json: Record<string, unknown>;
  workspace_id: string;
}): Promise<void> {
  if (job.type !== "evaluate_campaign") {
    await completeJob(job.id);
    return;
  }

  const campaignId = String(job.payload_json.campaignId);
  await evaluateCampaign(job.workspace_id, campaignId);
  await completeJob(job.id);
}

export async function processPendingJobs(workerId: string, maxJobs = 100): Promise<number> {
  return processPendingJobsInternal(workerId, maxJobs);
}

export async function processPendingJobsForWorkspace(
  workerId: string,
  workspaceId: string,
  maxJobs = 100,
): Promise<number> {
  return processPendingJobsInternal(workerId, maxJobs, workspaceId);
}

async function processPendingJobsInternal(
  workerId: string,
  maxJobs = 100,
  workspaceId?: string,
): Promise<number> {
  let processed = 0;

  while (processed < maxJobs) {
    const job = workspaceId
      ? await claimJobForWorkspace(workerId, workspaceId)
      : await claimJob(workerId);
    if (!job) {
      break;
    }

    try {
      await processJob(job);
    } catch (error) {
      await failJob(job.id, error instanceof Error ? error.message : "Unknown worker error");
    }

    processed += 1;
  }

  return processed;
}

export async function countPendingJobs(workspaceId?: string): Promise<number> {
  const row = await queryOne<{ count: string }>(
    `select count(*)::text as count
     from jobs
     where state = 'pending'
       and available_at <= now()
       and ($1::uuid is null or workspace_id = $1::uuid)`,
    [workspaceId ?? null],
  );

  return Number(row?.count ?? "0");
}

export async function listExceptionQueue(workspaceSlug = DEMO_WORKSPACE_SLUG) {
  return query(
    `select i.id, i.severity, i.confidence, i.status, i.detected_at,
            i.exposure_low_minor, i.exposure_high_minor, i.currency,
            c.name as campaign_name, i.rule_id
     from incidents i
     join campaigns c on c.id = i.campaign_id
     join workspaces w on w.id = i.workspace_id
     where w.slug = $1
     order by case i.status
       when 'detected' then 1
       when 'acknowledged' then 2
       when 'investigating' then 3
       when 'recovered' then 4
       else 5 end,
       i.detected_at desc`,
    [workspaceSlug],
  );
}

export async function getHealthyCampaignStatus(workspaceSlug = DEMO_WORKSPACE_SLUG) {
  return query(
    `select c.id, c.name,
      coalesce((
        select i.status::text from incidents i
        where i.campaign_id = c.id and i.status = any($2::incident_status[])
        order by i.detected_at desc
        limit 1
      ), 'healthy') as status
     from campaigns c
     join workspaces w on w.id = c.workspace_id
     where w.slug = $1`,
    [workspaceSlug, ACTIVE_INCIDENT_STATUSES],
  );
}


export async function listSourceHealth(workspaceSlug = DEMO_WORKSPACE_SLUG) {
  const rows = await query(
    `select sh.source, sh.expected_delay_minutes, sh.last_successful_event_at, sh.latest_mature_interval_end, sh.freshness_state, sh.connector_state
     from source_health sh
     join workspaces w on w.id = sh.workspace_id
     where w.slug = $1
     order by sh.source asc`,
    [workspaceSlug],
  );

  const now = new Date();
  return (rows as Array<Record<string, unknown>>).map((row) => {
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
}
