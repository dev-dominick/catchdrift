import { beforeEach, describe, expect, it } from "vitest";
import { query, queryOne } from "@/db/sql";
import { runDemoReplay } from "@/demo/scenario";
import { insertNonDemoWorkspaceFixture, prepareDemoState } from "./helpers";

describe("demo replay self-contained execution", () => {
  beforeEach(async () => {
    await prepareDemoState();
  });

  it("completes replay lifecycle without requiring a background worker", async () => {
    const result = await runDemoReplay({ instant: true });

    expect(result.incidentCount).toBe(1);
    expect(result.incidentId).toBeTruthy();

    const incident = await queryOne<{ status: string }>(
      `select status from incidents where id = $1`,
      [result.incidentId],
    );

    expect(incident?.status).toBe("recovered");

    const pendingJobs = await queryOne<{ count: string }>(
      `select count(*)::text as count from jobs where state = 'pending'`,
    );
    const runningJobs = await queryOne<{ count: string }>(
      `select count(*)::text as count from jobs where state = 'running'`,
    );

    expect(Number(pendingJobs?.count ?? "0")).toBe(0);
    expect(Number(runningJobs?.count ?? "0")).toBe(0);
  });

  it("does not consume pending jobs from unrelated workspaces", async () => {
    const external = await insertNonDemoWorkspaceFixture();

    const inserted = await queryOne<{ id: string }>(
      `insert into jobs (workspace_id, type, dedupe_key, payload_json, state, available_at)
       values ($1, 'evaluate_campaign', $2, $3::jsonb, 'pending', now())
       returning id`,
      [
        external.workspaceId,
        `external-${Date.now()}`,
        JSON.stringify({ campaignId: external.campaignId }),
      ],
    );

    expect(inserted?.id).toBeTruthy();

    await runDemoReplay({ instant: true });

    const job = await queryOne<{ state: string }>(
      `select state from jobs where id = $1`,
      [inserted?.id],
    );

    expect(job?.state).toBe("pending");

    await query(`delete from jobs where id = $1`, [inserted?.id]);
  });
});
