import { addMinutes, subMinutes } from "date-fns";
import { beforeEach, describe, expect, it } from "vitest";
import { evaluateCampaign, listSourceHealth } from "@/domain/engine";
import { query, queryOne } from "@/db/sql";
import {
  prepareDemoState,
  runWorker,
  seedDegraded,
  seedFailureDeployment,
  seedHealthy,
} from "./helpers";

describe("live PostgreSQL freshness behavior", () => {
  beforeEach(async () => {
    await prepareDemoState();
  });

  it("stale source suppresses evaluation", async () => {
    const seeded = await queryOne<{ campaign_id: string; workspace_id: string }>(
      `select campaign_id, workspace_id
       from external_campaign_mappings
       where source = 'meta' and external_campaign_id = 'meta-auto-211'
       limit 1`,
    );

    const campaignId = String(seeded?.campaign_id);
    const workspaceId = String(seeded?.workspace_id);
    const start = subMinutes(new Date(), 95);

    await seedHealthy(start, 12);
    await seedFailureDeployment();
    await seedDegraded(addMinutes(start, 60), 3);

    await query(
      `update source_health
       set last_successful_event_at = now() - interval '3 hour',
           latest_mature_interval_end = now() - interval '3 hour',
           freshness_state = 'healthy'
       where workspace_id = $1 and source = 'revenue'`,
      [workspaceId],
    );

    await evaluateCampaign(workspaceId, campaignId);

    const latestEvaluation = await queryOne<{ result: string; suppression_reason: string | null }>(
      `select result, suppression_reason
       from rule_evaluations
       where campaign_id = $1
       order by evaluated_at desc
       limit 1`,
      [campaignId],
    );

    expect(latestEvaluation?.result).toBe("suppressed");
    expect(String(latestEvaluation?.suppression_reason ?? "")).toContain("stale");
  });

  it("listSourceHealth derives UI freshness from timestamps, not stored freshness_state", async () => {
    const seeded = await queryOne<{ workspace_id: string }>(
      `select workspace_id
       from external_campaign_mappings
       where source = 'meta' and external_campaign_id = 'meta-auto-211'
       limit 1`,
    );

    const workspaceId = String(seeded?.workspace_id);

    const start = subMinutes(new Date(), 95);
    await seedHealthy(start, 1);

    await query(
      `update source_health
       set last_successful_event_at = now() - interval '3 hour',
           latest_mature_interval_end = now() - interval '3 hour',
           freshness_state = 'healthy'
       where workspace_id = $1 and source = 'revenue'`,
      [workspaceId],
    );

    const rows = await listSourceHealth();
    const revenue = (rows as Array<Record<string, unknown>>).find(
      (row) => String(row.source) === "revenue",
    );

    expect(revenue).toBeTruthy();
    expect(String(revenue?.freshness_label)).toBe("Stale");
    expect(Boolean(revenue?.suppresses_decisions)).toBe(true);
  });

  it("fresh data permits reevaluation", async () => {
    const seeded = await queryOne<{ campaign_id: string; workspace_id: string }>(
      `select campaign_id, workspace_id
       from external_campaign_mappings
       where source = 'meta' and external_campaign_id = 'meta-auto-211'
       limit 1`,
    );

    const campaignId = String(seeded?.campaign_id);
    const workspaceId = String(seeded?.workspace_id);
    const start = subMinutes(new Date(), 95);

    await seedHealthy(start, 12);
    await seedFailureDeployment();
    await seedDegraded(addMinutes(start, 60), 3);

    await query(
      `update source_health
       set last_successful_event_at = now() - interval '3 hour', freshness_state = 'stale'
       where workspace_id = $1 and source = 'revenue'`,
      [workspaceId],
    );

    await evaluateCampaign(workspaceId, campaignId);

    await query(
      `update source_health
       set last_successful_event_at = now(), freshness_state = 'healthy'
       where workspace_id = $1 and source = 'revenue'`,
      [workspaceId],
    );

    await runWorker("freshness-reeval");
    await evaluateCampaign(workspaceId, campaignId);

    const latestEvaluation = await queryOne<{ result: string }>(
      `select result
       from rule_evaluations
       where campaign_id = $1
       order by evaluated_at desc
       limit 1`,
      [campaignId],
    );

    expect(latestEvaluation?.result).not.toBe("suppressed");
  });
});
