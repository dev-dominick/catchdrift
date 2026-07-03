import "dotenv/config";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { addMinutes, subMinutes } from "date-fns";
import { Client } from "pg";
import { beforeEach, describe, expect, it } from "vitest";
import { query, queryOne } from "@/db/sql";
import {
  prepareDemoState,
  runWorker,
  seedDegraded,
  seedFailureDeployment,
  seedHealthy,
} from "./helpers";

const execFileAsync = promisify(execFile);

function getDatabaseUrlFromEnvFile(): string {
  const envPath = path.resolve(process.cwd(), ".env");
  const content = readFileSync(envPath, "utf8");
  const line = content.split("\n").find((entry) => entry.startsWith("DATABASE_URL="));
  if (!line) {
    throw new Error("DATABASE_URL not found in .env");
  }

  return line.replace("DATABASE_URL=", "").trim();
}

async function createTemporaryDatabase(dbName: string): Promise<string> {
  const base = new URL(getDatabaseUrlFromEnvFile());
  const admin = new URL(base.toString());
  admin.pathname = "/postgres";

  const adminClient = new Client({ connectionString: admin.toString() });
  await adminClient.connect();
  await adminClient.query(`drop database if exists ${dbName}`);
  await adminClient.query(`create database ${dbName}`);
  await adminClient.end();

  base.pathname = `/${dbName}`;
  return base.toString();
}

async function migrationCount(connectionString: string): Promise<number> {
  const client = new Client({ connectionString });
  await client.connect();
  const row = await client.query<{ count: string }>(
    "select count(*)::text as count from __drizzle_migrations",
  );
  await client.end();

  return Number(row.rows[0]?.count ?? "0");
}

describe("release hardening integration", () => {
  beforeEach(async () => {
    await prepareDemoState();
  });

  it("rolls back incident creation when evidence persistence fails", async () => {
    const seeded = await queryOne<{ campaign_id: string }>(
      `select campaign_id
       from external_campaign_mappings
       where source = 'meta' and external_campaign_id = 'meta-auto-211'
       limit 1`,
    );
    const campaignId = String(seeded?.campaign_id);
    const start = subMinutes(new Date(), 95);

    await seedHealthy(start, 12);
    await seedFailureDeployment();
    await seedDegraded(addMinutes(start, 60), 3);

    await query(`
      create or replace function fail_incident_evidence_insert()
      returns trigger as $$
      begin
        raise exception 'forced incident evidence failure';
      end;
      $$ language plpgsql;
    `);

    await query(`
      create trigger trg_fail_incident_evidence_insert
      before insert on incident_evidence
      for each row execute function fail_incident_evidence_insert();
    `);

    await runWorker("rollback-test-worker");

    const incidentCount = await queryOne<{ count: string }>(
      `select count(*)::text as count from incidents where campaign_id = $1`,
      [campaignId],
    );

    await query(`drop trigger if exists trg_fail_incident_evidence_insert on incident_evidence`);
    await query(`drop function if exists fail_incident_evidence_insert`);

    expect(Number(incidentCount?.count ?? "0")).toBe(0);
  });

  it("allows concurrent migrators to complete safely on one database", async () => {
    const dbUrl = await createTemporaryDatabase("catchdrift_mig_concurrent");

    const runMigrator = () =>
      execFileAsync("pnpm", ["db:migrate"], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          DATABASE_URL: dbUrl,
        },
        timeout: 120000,
      });

    await Promise.all([runMigrator(), runMigrator()]);

    const count = await migrationCount(dbUrl);
    expect(count).toBe(2);
  });

  it("contains no production demo test routes", async () => {
    const hardResetRoute = path.resolve(process.cwd(), "src/app/api/demo/test/hard-reset/route.ts");
    const staleSourceRoute = path.resolve(process.cwd(), "src/app/api/demo/test/stale-source/route.ts");
    expect(existsSync(hardResetRoute)).toBe(false);
    expect(existsSync(staleSourceRoute)).toBe(false);

    const manifestPath = path.resolve(process.cwd(), ".next/server/app-paths-manifest.json");
    if (existsSync(manifestPath)) {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, string>;
      const keys = Object.keys(manifest).filter((key) => key.includes("/api/demo/test"));
      expect(keys).toHaveLength(0);
    }
  });
});
