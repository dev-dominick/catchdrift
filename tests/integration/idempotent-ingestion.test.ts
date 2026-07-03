import { addMinutes, subMinutes } from "date-fns";
import { beforeEach, describe, expect, it } from "vitest";
import { ingestDeploymentEvent, ingestMetricObservation, resetDemoWorkspace } from "@/domain/engine";
import { queryOne } from "@/db/sql";
import { DEMO_EXTERNAL_CAMPAIGN_ID } from "@/lib/constants";
import { prepareDemoState } from "./helpers";

describe("live PostgreSQL ingestion semantics", () => {
  beforeEach(async () => {
    await prepareDemoState();
  });

  it("duplicate metric ingestion is idempotent", async () => {
    const start = subMinutes(new Date(), 15);
    const end = addMinutes(start, 5);

    const first = await ingestMetricObservation({
      source: "spend_feed",
      externalCampaignId: DEMO_EXTERNAL_CAMPAIGN_ID,
      metric: "spend",
      value: "75",
      intervalStart: start.toISOString(),
      intervalEnd: end.toISOString(),
      sourceRecordId: "dup-1",
      revision: 1,
      maturity: "mature",
      currency: "USD",
    });

    const second = await ingestMetricObservation({
      source: "spend_feed",
      externalCampaignId: DEMO_EXTERNAL_CAMPAIGN_ID,
      metric: "spend",
      value: "75",
      intervalStart: start.toISOString(),
      intervalEnd: end.toISOString(),
      sourceRecordId: "dup-1",
      revision: 1,
      maturity: "mature",
      currency: "USD",
    });

    const count = await queryOne<{ count: string }>(
      `select count(*)::text as count
       from metric_observations
       where source_record_id = 'dup-1'`,
    );

    expect(first.status).toBe("inserted");
    expect(second.status).toBe("duplicate");
    expect(Number(count?.count ?? "0")).toBe(1);
  });

  it("revised event ingestion persists next revision", async () => {
    const start = subMinutes(new Date(), 15);
    const end = addMinutes(start, 5);

    await ingestMetricObservation({
      source: "spend_feed",
      externalCampaignId: DEMO_EXTERNAL_CAMPAIGN_ID,
      metric: "spend",
      value: "75",
      intervalStart: start.toISOString(),
      intervalEnd: end.toISOString(),
      sourceRecordId: "rev-1",
      revision: 1,
      maturity: "mature",
      currency: "USD",
    });

    const revised = await ingestMetricObservation({
      source: "spend_feed",
      externalCampaignId: DEMO_EXTERNAL_CAMPAIGN_ID,
      metric: "spend",
      value: "76",
      intervalStart: start.toISOString(),
      intervalEnd: end.toISOString(),
      sourceRecordId: "rev-1",
      revision: 2,
      maturity: "mature",
      currency: "USD",
    });

    const count = await queryOne<{ count: string }>(
      `select count(*)::text as count
       from metric_observations
       where source_record_id = 'rev-1'`,
    );

    expect(revised.status).toBe("revised");
    expect(Number(count?.count ?? "0")).toBe(2);
  });

  it("same revision with different payload hash is conflict", async () => {
    const start = subMinutes(new Date(), 15);
    const end = addMinutes(start, 5);

    await ingestMetricObservation({
      source: "spend_feed",
      externalCampaignId: DEMO_EXTERNAL_CAMPAIGN_ID,
      metric: "spend",
      value: "75",
      intervalStart: start.toISOString(),
      intervalEnd: end.toISOString(),
      sourceRecordId: "conflict-1",
      revision: 1,
      maturity: "mature",
      currency: "USD",
    });

    const conflict = await ingestMetricObservation({
      source: "spend_feed",
      externalCampaignId: DEMO_EXTERNAL_CAMPAIGN_ID,
      metric: "spend",
      value: "99",
      intervalStart: start.toISOString(),
      intervalEnd: end.toISOString(),
      sourceRecordId: "conflict-1",
      revision: 1,
      maturity: "mature",
      currency: "USD",
    });

    expect(conflict.status).toBe("conflict");
  });

  it("lower metric revision is stale_revision", async () => {
    const start = subMinutes(new Date(), 15);
    const end = addMinutes(start, 5);

    await ingestMetricObservation({
      source: "spend_feed",
      externalCampaignId: DEMO_EXTERNAL_CAMPAIGN_ID,
      metric: "spend",
      value: "75",
      intervalStart: start.toISOString(),
      intervalEnd: end.toISOString(),
      sourceRecordId: "stale-1",
      revision: 2,
      maturity: "mature",
      currency: "USD",
    });

    const stale = await ingestMetricObservation({
      source: "spend_feed",
      externalCampaignId: DEMO_EXTERNAL_CAMPAIGN_ID,
      metric: "spend",
      value: "74",
      intervalStart: start.toISOString(),
      intervalEnd: end.toISOString(),
      sourceRecordId: "stale-1",
      revision: 1,
      maturity: "mature",
      currency: "USD",
    });

    expect(stale.status).toBe("stale_revision");
  });

  it("deployment ingestion supports duplicate revised stale and conflict semantics", async () => {
    const deployedAt = subMinutes(new Date(), 40);

    const first = await ingestDeploymentEvent({
      source: "github",
      externalCampaignId: DEMO_EXTERNAL_CAMPAIGN_ID,
      externalDeploymentId: "semantics-v42",
      version: "v42",
      deployedAt: deployedAt.toISOString(),
      changes: [{ path: "redirectUrl", previousValue: "/apply?click_id={{click_id}}", nextValue: "/apply" }],
    });

    const duplicate = await ingestDeploymentEvent({
      source: "github",
      externalCampaignId: DEMO_EXTERNAL_CAMPAIGN_ID,
      externalDeploymentId: "semantics-v42",
      version: "v42",
      deployedAt: deployedAt.toISOString(),
      changes: [{ path: "redirectUrl", previousValue: "/apply?click_id={{click_id}}", nextValue: "/apply" }],
    });

    const conflict = await ingestDeploymentEvent({
      source: "github",
      externalCampaignId: DEMO_EXTERNAL_CAMPAIGN_ID,
      externalDeploymentId: "semantics-v42",
      version: "v42-hotfix",
      deployedAt: deployedAt.toISOString(),
      changes: [{ path: "redirectUrl", previousValue: "/apply", nextValue: "/apply?click_id={{click_id}}" }],
    });

    const stale = await ingestDeploymentEvent({
      source: "github",
      externalCampaignId: DEMO_EXTERNAL_CAMPAIGN_ID,
      externalDeploymentId: "semantics-v42",
      version: "v41",
      deployedAt: subMinutes(deployedAt, 5).toISOString(),
      changes: [{ path: "redirectUrl", previousValue: "/apply?click_id={{click_id}}", nextValue: "/apply?legacy=1" }],
    });

    const revised = await ingestDeploymentEvent({
      source: "github",
      externalCampaignId: DEMO_EXTERNAL_CAMPAIGN_ID,
      externalDeploymentId: "semantics-v42",
      version: "v43",
      deployedAt: addMinutes(deployedAt, 5).toISOString(),
      changes: [{ path: "redirectUrl", previousValue: "/apply", nextValue: "/apply?click_id={{click_id}}" }],
    });

    expect(first.status).toBe("inserted");
    expect(duplicate.status).toBe("duplicate");
    expect(conflict.status).toBe("conflict");
    expect(stale.status).toBe("stale_revision");
    expect(revised.status).toBe("revised");
  });

  it("demo reset cannot delete non-demo workspace data", async () => {
    const workspace = await queryOne<{ id: string }>(
      `insert into workspaces (slug, name) values ('external-workspace', 'External Workspace')
       on conflict (slug) do update set name = excluded.name
       returning id`,
    );

    expect(workspace).toBeTruthy();

    await resetDemoWorkspace();

    const persisted = await queryOne<{ id: string }>(
      `select id from workspaces where slug = 'external-workspace'`,
    );

    expect(persisted?.id).toBe(workspace?.id);
  });
});
