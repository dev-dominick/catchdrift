import { addMinutes, subMinutes } from "date-fns";
import {
  countPendingJobs,
  ensureDemoWorkspaceAndCampaign,
  ingestDeploymentEvent,
  ingestMetricObservation,
  processPendingJobsForWorkspace,
  resetDemoWorkspace,
} from "@/domain/engine";
import { query, queryOne } from "@/db/sql";
import { DEMO_EXTERNAL_CAMPAIGN_ID } from "@/lib/constants";
import { formatMoneyRangeMinor } from "@/lib/format";
import { DEFAULT_EXPOSURE_RATE_PER_HOUR_MINOR, deriveExposureModel } from "@/lib/presentation-contract";

const DEMO_REPLAY_INLINE_WORKER_ID = "demo-replay-inline";
const DEMO_REPLAY_JOB_BATCH_SIZE = 500;
const DEMO_REPLAY_MAX_DRAIN_PASSES = 6;

const METRIC_SOURCES: Record<string, string> = {
  spend: "spend_feed",
  paid_clicks: "ads_clicks",
  sessions: "landing_telemetry",
  internal_submissions: "internal_forms",
  attributed_conversions: "attribution",
  revenue: "revenue",
};

export type IntervalShape = {
  spend: number;
  paid_clicks: number;
  sessions: number;
  internal_submissions: number;
  attributed_conversions: number;
  revenue: number;
};

export const HEALTHY: IntervalShape = {
  spend: 75,
  paid_clicks: 410,
  sessions: 394,
  internal_submissions: 42,
  attributed_conversions: 40,
  revenue: 105,
};

export const DEGRADED: IntervalShape = {
  spend: 75,
  paid_clicks: 415,
  sessions: 340,
  internal_submissions: 40,
  attributed_conversions: 30,
  revenue: 72,
};

export const RECOVERY: IntervalShape = {
  spend: 75,
  paid_clicks: 408,
  sessions: 392,
  internal_submissions: 42,
  attributed_conversions: 39,
  revenue: 103,
};

async function ingestInterval(index: number, intervalStart: Date, data: IntervalShape) {
  const intervalEnd = addMinutes(intervalStart, 5);

  for (const [metric, value] of Object.entries(data)) {
    const source = METRIC_SOURCES[metric];
    await ingestMetricObservation({
      source,
      externalCampaignId: DEMO_EXTERNAL_CAMPAIGN_ID,
      metric: metric as keyof IntervalShape,
      value: String(value),
      intervalStart: intervalStart.toISOString(),
      intervalEnd: intervalEnd.toISOString(),
      sourceRecordId: `${source}-${metric}-${intervalStart.toISOString()}`,
      revision: 1,
      maturity: "mature",
      currency: metric === "spend" || metric === "revenue" ? "USD" : undefined,
    });
  }

  return { intervalStart, intervalEnd, index };
}

export async function runDemoReplay(options?: { instant?: boolean; onStage?: (line: string) => Promise<void> | void }) {
  const out = async (line: string) => {
    if (options?.onStage) {
      await options.onStage(line);
    }
  };

  await resetDemoWorkspace();
  await out("✓ Demo workspace reset");
  await timelinePause(options?.instant, 1000);

  const { campaignId, workspaceId } = await ensureDemoWorkspaceAndCampaign();
  await out("✓ Campaign mapping created");
  await timelinePause(options?.instant, 800);

  const start = subMinutes(new Date(), 95);
  let latestIncidentId: string | null = null;

  for (let i = 0; i < 12; i += 1) {
    const intervalStart = addMinutes(start, i * 5);
    await ingestInterval(i, intervalStart, HEALTHY);
  }
  await drainReplayQueue(workspaceId);
  await waitForCheckpoint(
    "healthy baseline evaluations",
    async () => {
      const result = await queryOne<{ count: string }>(
        `select count(*)::text as count
         from rule_evaluations
         where campaign_id = $1 and result = 'normal'`,
        [campaignId],
      );

      const activeIncident = await queryOne<{ id: string }>(
        `select id from incidents where campaign_id = $1 and status in ('detected', 'acknowledged', 'investigating') limit 1`,
        [campaignId],
      );

      return Number(result?.count ?? "0") >= 1 && !activeIncident;
    },
    options?.instant,
  );

  await out("✓ 12 healthy intervals ingested");
  await out("✓ Healthy evaluations completed without an incident");
  await timelinePause(options?.instant, 1800);

  const deploymentAt = addMinutes(start, 60);
  await ingestDeploymentEvent({
    source: "github",
    externalCampaignId: DEMO_EXTERNAL_CAMPAIGN_ID,
    externalDeploymentId: "deploy-v42",
    version: "v42",
    deployedAt: deploymentAt.toISOString(),
    changes: [
      {
        path: "redirectUrl",
        previousValue: "/apply?click_id={{click_id}}",
        nextValue: "/apply",
      },
    ],
  });
  await drainReplayQueue(workspaceId);
  await waitForCheckpoint(
    "deployment v42 persisted",
    async () => {
      const deployment = await queryOne<{ id: string }>(
        `select id from deployment_events
         where campaign_id = $1 and version = 'v42'
         limit 1`,
        [campaignId],
      );

      return Boolean(deployment);
    },
    options?.instant,
  );

  await out("✓ Deployment v42 recorded");
  await timelinePause(options?.instant, 1800);

  const firstDegradedStart = addMinutes(start, 60);
  await ingestInterval(13, firstDegradedStart, DEGRADED);
  await drainReplayQueue(workspaceId);
  await waitForCheckpoint(
    "first degraded interval evaluated",
    async () => {
      const activeIncident = await queryOne<{ id: string }>(
        `select id from incidents where campaign_id = $1 and status in ('detected', 'acknowledged', 'investigating') limit 1`,
        [campaignId],
      );
      const evaluations = await queryOne<{ count: string }>(
        `select count(*)::text as count from rule_evaluations where campaign_id = $1`,
        [campaignId],
      );
      return Number(evaluations?.count ?? "0") >= 2 && !activeIncident;
    },
    options?.instant,
  );

  await out("✓ First degraded interval matured — incident withheld");
  await timelinePause(options?.instant, 1800);

  const secondDegradedStart = addMinutes(start, 65);
  await ingestInterval(14, secondDegradedStart, DEGRADED);
  await drainReplayQueue(workspaceId);
  await waitForCheckpoint(
    "second degraded interval evaluated",
    async () => {
      const activeIncident = await queryOne<{ id: string }>(
        `select id from incidents where campaign_id = $1 and status in ('detected', 'acknowledged', 'investigating') limit 1`,
        [campaignId],
      );
      const evaluations = await queryOne<{ count: string }>(
        `select count(*)::text as count from rule_evaluations where campaign_id = $1`,
        [campaignId],
      );
      return Number(evaluations?.count ?? "0") >= 3 && !activeIncident;
    },
    options?.instant,
  );

  await out("✓ Second degraded interval matured — incident withheld");
  await timelinePause(options?.instant, 1800);

  const thirdDegradedStart = addMinutes(start, 70);
  await ingestInterval(15, thirdDegradedStart, DEGRADED);
  await drainReplayQueue(workspaceId);
  await waitForCheckpoint(
    "third degraded interval evaluated",
    async () => {
      await drainReplayQueue(workspaceId);

      const evaluations = await queryOne<{ count: string }>(
        `select count(*)::text as count from rule_evaluations where campaign_id = $1`,
        [campaignId],
      );

      const incidentAfterThirdInterval = await queryOne<{ id: string }>(
        `select id
         from incidents
         where campaign_id = $1 and status in ('detected', 'acknowledged', 'investigating')
         order by detected_at desc
         limit 1`,
        [campaignId],
      );

      return Number(evaluations?.count ?? "0") >= 4 && Boolean(incidentAfterThirdInterval);
    },
    options?.instant,
  );

  await out("✓ Third degraded interval matured");
  const incidentAfterThirdInterval = await queryOne<{ id: string }>(
    `select id
     from incidents
     where campaign_id = $1 and status in ('detected', 'acknowledged', 'investigating')
     order by detected_at desc
     limit 1`,
    [campaignId],
  );

  if (!incidentAfterThirdInterval) {
    throw new Error("Replay checkpoint completed without an active incident.");
  }

  latestIncidentId = incidentAfterThirdInterval.id;
  const exposureModel = deriveExposureModel({
    lowPerHourMinor: DEFAULT_EXPOSURE_RATE_PER_HOUR_MINOR.low,
    highPerHourMinor: DEFAULT_EXPOSURE_RATE_PER_HOUR_MINOR.high,
    deployedAt: deploymentAt.toISOString(),
    detectedAt: thirdDegradedStart.toISOString(),
  });
  await out("✓ tracking_integrity_failure@1 triggered");
  await out("✓ Deployment v42 correlated");
  await out(
    `✓ Exposure during detection estimated at ${formatMoneyRangeMinor(
      exposureModel.beforeDetectionMinor.lowMinor,
      exposureModel.beforeDetectionMinor.highMinor,
    )}`,
  );
  await out("✓ Incident persisted with versioned evidence");
  await timelinePause(options?.instant, 2000);

  if (latestIncidentId) {
    await out(`INCIDENT_ID:${latestIncidentId}`);
    await out(`INCIDENT_URL:/incidents/${latestIncidentId}`);
  }

  await ingestDeploymentEvent({
    source: "github",
    externalCampaignId: DEMO_EXTERNAL_CAMPAIGN_ID,
    externalDeploymentId: "deploy-v43",
    version: "v43",
    deployedAt: addMinutes(start, 75).toISOString(),
    changes: [
      {
        path: "redirectUrl",
        previousValue: "/apply",
        nextValue: "/apply?click_id={{click_id}}",
      },
    ],
  });
  await out("✓ Deployment v43 recorded");
  await drainReplayQueue(workspaceId);
  await timelinePause(options?.instant, 1800);

  for (let i = 0; i < 3; i += 1) {
    await ingestInterval(16 + i, addMinutes(start, 75 + i * 5), RECOVERY);
  }
  await drainReplayQueue(workspaceId);

  await waitForCheckpoint(
    "incident recovered after recovery intervals",
    async () => {
      await drainReplayQueue(workspaceId);

      const incident = await queryOne<{ id: string; status: string; recovered_at: string | null }>(
        `select id, status, recovered_at
         from incidents
         where id = $1
         order by detected_at desc
         limit 1`,
        [latestIncidentId],
      );

      return Boolean(incident?.status === "recovered" && incident.recovered_at);
    },
    options?.instant,
  );

  await out("✓ Recovery intervals ingested");
  await out("✓ Campaign recovered");

  const incidents = await query<{ count: string }>(
    `select count(*)::text as count from incidents where campaign_id = $1`,
    [campaignId],
  );

  return {
    incidentCount: Number(incidents[0]?.count ?? "0"),
    incidentId: latestIncidentId,
  };
}

async function drainReplayQueue(workspaceId: string): Promise<void> {
  let totalProcessed = 0;

  for (let pass = 0; pass < DEMO_REPLAY_MAX_DRAIN_PASSES; pass += 1) {
    const processed = await processPendingJobsForWorkspace(
      DEMO_REPLAY_INLINE_WORKER_ID,
      workspaceId,
      DEMO_REPLAY_JOB_BATCH_SIZE,
    );
    totalProcessed += processed;

    if (processed < DEMO_REPLAY_JOB_BATCH_SIZE) {
      return;
    }
  }

  const remaining = await countPendingJobs(workspaceId);
  throw new Error(
    `Replay exceeded bounded inline job processing. Processed ${totalProcessed} jobs; ${remaining} demo jobs remain pending.`,
  );
}

async function waitForCheckpoint(
  label: string,
  check: () => Promise<boolean>,
  instantMode = false,
): Promise<void> {
  const timeoutMs = instantMode ? 20_000 : 120_000;
  const intervalMs = instantMode ? 100 : 500;
  const startedAt = Date.now();

  while (Date.now() - startedAt <= timeoutMs) {
    if (await check()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`Timeout waiting for checkpoint: ${label}.`);
}

async function timelinePause(instantMode: boolean | undefined, ms: number): Promise<void> {
  if (instantMode) {
    return;
  }

  await new Promise((resolve) => setTimeout(resolve, ms));
}
