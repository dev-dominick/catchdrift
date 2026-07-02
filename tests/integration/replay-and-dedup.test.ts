import { addMinutes, subMinutes } from "date-fns";
import { beforeEach, describe, expect, it } from "vitest";
import { query, queryOne } from "@/db/sql";
import {
  activeIncidentCount,
  latestIncident,
  prepareDemoState,
  runWorker,
  seedDegraded,
  seedFailureDeployment,
  seedHealthy,
  seedRecovery,
  seedRecoveryDeployment,
} from "./helpers";

describe("live PostgreSQL worker and incident lifecycle", () => {
  beforeEach(async () => {
    await prepareDemoState();
  });

  it("first two degraded intervals do not trigger and third does", async () => {
    const seeded = await queryOne<{ campaign_id: string }>(
      `select campaign_id from external_campaign_mappings where source = 'meta' and external_campaign_id = 'meta-auto-211' limit 1`,
    );
    expect(seeded?.campaign_id).toBeTruthy();

    const campaignId = String(seeded?.campaign_id);
    const start = subMinutes(new Date(), 95);

    await seedHealthy(start, 12);
    await runWorker();

    await seedFailureDeployment();
    await runWorker();

    await seedDegraded(addMinutes(start, 60), 1);
    await runWorker();
    expect(await activeIncidentCount(campaignId)).toBe(0);

    await seedDegraded(addMinutes(start, 65), 1);
    await runWorker();
    expect(await activeIncidentCount(campaignId)).toBe(0);

    await seedDegraded(addMinutes(start, 70), 1);
    await runWorker();
    expect(await activeIncidentCount(campaignId)).toBe(1);
  });

  it("worker reprocessing does not duplicate active incidents", async () => {
    const seeded = await queryOne<{ campaign_id: string }>(
      `select campaign_id from external_campaign_mappings where source = 'meta' and external_campaign_id = 'meta-auto-211' limit 1`,
    );
    const campaignId = String(seeded?.campaign_id);
    const start = subMinutes(new Date(), 95);

    await seedHealthy(start, 12);
    await seedFailureDeployment();
    await seedDegraded(addMinutes(start, 60), 3);

    await runWorker();
    await runWorker();

    const incidentCount = await queryOne<{ count: string }>(
      `select count(*)::text as count
       from incidents
       where campaign_id = $1`,
      [campaignId],
    );

    expect(Number(incidentCount?.count ?? "0")).toBe(1);
  });

  it("persists deployment candidate scoring and exposure values", async () => {
    const seeded = await queryOne<{ campaign_id: string }>(
      `select campaign_id from external_campaign_mappings where source = 'meta' and external_campaign_id = 'meta-auto-211' limit 1`,
    );
    const campaignId = String(seeded?.campaign_id);
    const start = subMinutes(new Date(), 95);

    await seedHealthy(start, 12);
    await seedFailureDeployment();
    await seedDegraded(addMinutes(start, 60), 3);
    await runWorker();

    const incident = await latestIncident(campaignId);
    expect(incident).toBeTruthy();
    expect(Number(incident?.exposure_low_minor ?? "0")).toBeGreaterThan(0);
    expect(Number(incident?.exposure_high_minor ?? "0")).toBeGreaterThan(0);

    const deploymentEvidence = await queryOne<{ evidence_json: { score?: { total?: number } } }>(
      `select evidence_json
       from incident_evidence
       where incident_id = $1 and evidence_type = 'deployment'
       limit 1`,
      [incident?.id],
    );

    expect(Number(deploymentEvidence?.evidence_json?.score?.total ?? 0)).toBeGreaterThan(0);
  });

  it("recovery transitions incident and preserves original evidence", async () => {
    const seeded = await queryOne<{ campaign_id: string }>(
      `select campaign_id from external_campaign_mappings where source = 'meta' and external_campaign_id = 'meta-auto-211' limit 1`,
    );
    const campaignId = String(seeded?.campaign_id);
    const start = subMinutes(new Date(), 95);

    await seedHealthy(start, 12);
    await seedFailureDeployment();
    await seedDegraded(addMinutes(start, 60), 3);
    await runWorker();

    const incident = await latestIncident(campaignId);
    expect(incident?.id).toBeTruthy();

    const evidenceCountBefore = await queryOne<{ count: string }>(
      `select count(*)::text as count from incident_evidence where incident_id = $1`,
      [incident?.id],
    );

    await seedRecoveryDeployment();
    await seedRecovery(addMinutes(start, 75), 3);
    await runWorker();

    const after = await latestIncident(campaignId);
    expect(after?.status).toBe("recovered");

    const evidenceCountAfter = await queryOne<{ count: string }>(
      `select count(*)::text as count from incident_evidence where incident_id = $1`,
      [incident?.id],
    );

    const recoveredEvents = await queryOne<{ count: string }>(
      `select count(*)::text as count
       from incident_events
       where incident_id = $1 and event_type = 'recovered'`,
      [incident?.id],
    );

    expect(Number(evidenceCountBefore?.count ?? "0")).toBe(
      Number(evidenceCountAfter?.count ?? "0"),
    );
    expect(Number(recoveredEvents?.count ?? "0")).toBeGreaterThan(0);
  });

  it("jobs are claimed and completed by worker", async () => {
    const start = subMinutes(new Date(), 95);
    await seedHealthy(start, 1);

    const pendingBefore = await queryOne<{ count: string }>(
      `select count(*)::text as count from jobs where state = 'pending'`,
    );
    expect(Number(pendingBefore?.count ?? "0")).toBeGreaterThan(0);

    await runWorker();

    const runningAfter = await queryOne<{ count: string }>(
      `select count(*)::text as count from jobs where state = 'running'`,
    );

    const completedAfter = await queryOne<{ count: string }>(
      `select count(*)::text as count from jobs where state = 'completed'`,
    );

    expect(Number(runningAfter?.count ?? "0")).toBe(0);
    expect(Number(completedAfter?.count ?? "0")).toBeGreaterThan(0);

    const failedJobs = await query<{ id: string; last_error_redacted: string | null }>(
      `select id, last_error_redacted from jobs where state = 'failed'`,
    );
    expect(failedJobs.length).toBe(0);
  });
});
