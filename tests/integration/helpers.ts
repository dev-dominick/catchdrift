import { addMinutes } from "date-fns";
import {
  ensureDemoWorkspaceAndCampaign,
  ingestDeploymentEvent,
  ingestMetricObservation,
  processPendingJobs,
  resetDemoWorkspace,
} from "@/domain/engine";
import { query, queryOne } from "@/db/sql";
import { DEMO_EXTERNAL_CAMPAIGN_ID } from "@/lib/constants";

const METRIC_SOURCES: Record<string, string> = {
  spend: "spend_feed",
  paid_clicks: "ads_clicks",
  sessions: "landing_telemetry",
  internal_submissions: "internal_forms",
  attributed_conversions: "attribution",
  revenue: "revenue",
};

const HEALTHY = {
  spend: 75,
  paid_clicks: 410,
  sessions: 394,
  internal_submissions: 42,
  attributed_conversions: 40,
  revenue: 105,
};

const DEGRADED = {
  spend: 75,
  paid_clicks: 415,
  sessions: 340,
  internal_submissions: 40,
  attributed_conversions: 30,
  revenue: 72,
};

const RECOVERY = {
  spend: 75,
  paid_clicks: 408,
  sessions: 392,
  internal_submissions: 42,
  attributed_conversions: 39,
  revenue: 103,
};

export async function prepareDemoState() {
  await resetDemoWorkspace();
  return ensureDemoWorkspaceAndCampaign();
}

export async function ingestInterval(
  intervalStart: Date,
  values: typeof HEALTHY,
  revision = 1,
): Promise<void> {
  const intervalEnd = addMinutes(intervalStart, 5);

  for (const [metric, value] of Object.entries(values)) {
    const source = METRIC_SOURCES[metric];
    await ingestMetricObservation({
      source,
      externalCampaignId: DEMO_EXTERNAL_CAMPAIGN_ID,
      metric: metric as
        | "spend"
        | "paid_clicks"
        | "sessions"
        | "internal_submissions"
        | "attributed_conversions"
        | "revenue",
      value: String(value),
      intervalStart: intervalStart.toISOString(),
      intervalEnd: intervalEnd.toISOString(),
      sourceRecordId: `${source}-${metric}-${intervalStart.toISOString()}`,
      revision,
      maturity: "mature",
      currency: metric === "spend" || metric === "revenue" ? "USD" : undefined,
    });
  }
}

export async function seedHealthy(start: Date, count = 12) {
  for (let i = 0; i < count; i += 1) {
    await ingestInterval(addMinutes(start, i * 5), HEALTHY);
  }
}

export async function seedDegraded(start: Date, count = 3) {
  for (let i = 0; i < count; i += 1) {
    await ingestInterval(addMinutes(start, i * 5), DEGRADED);
  }
}

export async function seedRecovery(start: Date, count = 3) {
  for (let i = 0; i < count; i += 1) {
    await ingestInterval(addMinutes(start, i * 5), RECOVERY);
  }
}

export async function seedFailureDeployment() {
  await ingestDeploymentEvent({
    source: "github",
    externalCampaignId: DEMO_EXTERNAL_CAMPAIGN_ID,
    externalDeploymentId: "deploy-v42",
    version: "v42",
    deployedAt: new Date().toISOString(),
    changes: [
      {
        path: "redirectUrl",
        previousValue: "/apply?click_id={{click_id}}",
        nextValue: "/apply",
      },
    ],
  });
}

export async function seedRecoveryDeployment() {
  await ingestDeploymentEvent({
    source: "github",
    externalCampaignId: DEMO_EXTERNAL_CAMPAIGN_ID,
    externalDeploymentId: "deploy-v43",
    version: "v43",
    deployedAt: new Date().toISOString(),
    changes: [
      {
        path: "redirectUrl",
        previousValue: "/apply",
        nextValue: "/apply?click_id={{click_id}}",
      },
    ],
  });
}

export async function runWorker(workerId = "integration-worker") {
  await processPendingJobs(workerId, 1000);
}

export async function activeIncidentCount(campaignId: string) {
  const row = await queryOne<{ count: string }>(
    `select count(*)::text as count
     from incidents
     where campaign_id = $1
       and status in ('detected', 'acknowledged', 'investigating')`,
    [campaignId],
  );
  return Number(row?.count ?? "0");
}

export async function latestIncident(campaignId: string) {
  return queryOne<{ id: string; status: string; exposure_low_minor: string | null; exposure_high_minor: string | null }>(
    `select id, status, exposure_low_minor::text, exposure_high_minor::text
     from incidents
     where campaign_id = $1
     order by detected_at desc
     limit 1`,
    [campaignId],
  );
}

export async function insertNonDemoWorkspaceFixture() {
  const workspace = await queryOne<{ id: string }>(
    `insert into workspaces (slug, name) values ('external-workspace', 'External Workspace')
     on conflict (slug) do update set name = excluded.name
     returning id`,
  );

  if (!workspace) {
    throw new Error("Failed to create external workspace fixture");
  }

  const campaign = await queryOne<{ id: string }>(
    `insert into campaigns (workspace_id, internal_key, name, currency, timezone)
     values ($1, 'ext-1', 'External Campaign', 'USD', 'America/New_York')
     on conflict (workspace_id, internal_key)
     do update set name = excluded.name
     returning id`,
    [workspace.id],
  );

  if (!campaign) {
    throw new Error("Failed to create external campaign fixture");
  }

  await query(
    `insert into external_campaign_mappings (workspace_id, campaign_id, source, external_campaign_id)
     values ($1, $2, 'spend_feed', 'external-campaign-1')
     on conflict (workspace_id, source, external_campaign_id) do nothing`,
    [workspace.id, campaign.id],
  );

  await query(
    `insert into metric_observations (
      workspace_id, campaign_id, source, metric, value_decimal, currency,
      interval_start, interval_end, source_record_id, source_revision, maturity, payload_hash
    ) values (
      $1, $2, 'spend_feed', 'spend', '10', 'USD',
      now() - interval '10 minute', now() - interval '5 minute', 'ext-fixture-1', 1, 'mature', 'fixture'
    )`,
    [workspace.id, campaign.id],
  );

  return { workspaceId: workspace.id, campaignId: campaign.id };
}

export const Fixtures = {
  HEALTHY,
  DEGRADED,
  RECOVERY,
};
