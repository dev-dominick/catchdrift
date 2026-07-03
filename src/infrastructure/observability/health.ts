import { queryOne } from "@/db/sql";
import { getEnv } from "@/lib/env";

const READINESS_TIMEOUT_MS = 1500;

export async function checkLiveness(): Promise<{ ok: true }> {
  return { ok: true };
}

async function readinessProbe(): Promise<{ ok: boolean; reason?: string }> {
  try {
    // Validate environment at probe time to ensure required settings are present.
    getEnv();

    const db = await queryOne<{ ok: number }>("select 1 as ok");
    if (!db || db.ok !== 1) {
      return { ok: false, reason: "DB_UNREACHABLE" };
    }

    const migrationState = await queryOne<{ count: string }>(
      "select count(*)::text as count from __drizzle_migrations",
    );

    if (!migrationState || Number(migrationState.count) < 1) {
      return { ok: false, reason: "SCHEMA_NOT_MIGRATED" };
    }

    return { ok: true };
  } catch {
    return { ok: false, reason: "READINESS_CHECK_FAILED" };
  }
}

export async function checkReadiness(): Promise<{ ok: boolean; reason?: string }> {
  const timeout = new Promise<{ ok: false; reason: string }>((resolve) => {
    setTimeout(() => resolve({ ok: false, reason: "READINESS_TIMEOUT" }), READINESS_TIMEOUT_MS);
  });

  return Promise.race([readinessProbe(), timeout]);
}
