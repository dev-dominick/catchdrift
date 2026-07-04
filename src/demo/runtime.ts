import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { runDemoReplay } from "@/demo/scenario";
import { query, queryOne, withAdvisoryLock } from "@/db/sql";
import { getEnv } from "@/lib/env";
import { logger } from "@/infrastructure/logging/logger";

const DEMO_LOCK_ID = 4242001;
const SESSION_COOKIE = "catchdrift_demo_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const REPLAY_COOLDOWN_SECONDS = 8;
const RESET_COOLDOWN_SECONDS = 5;

type DemoOperation = "replay" | "reset";
type DemoRunStatus = "running" | "completed" | "failed";

type DemoRunRecord = {
  id: string;
  session_id: string;
  operation: DemoOperation;
  status: DemoRunStatus;
  stage_key: string;
  stage_label: string;
  stage_index: number;
  stage_total: number;
  incident_id: string | null;
  incident_url: string | null;
  log_lines: string[];
  public_reference: string | null;
  public_message: string | null;
  started_at: string;
  completed_at: string | null;
};

async function incidentExists(incidentId: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `select id from incidents where id = $1 limit 1`,
    [incidentId],
  );

  return Boolean(row?.id);
}

function buildPublicErrorReference(): string {
  return `CD-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function classifyStage(line: string): { stageKey: string; stageLabel: string; stageIndex: number } | null {
  if (line.includes("Healthy evaluations completed")) {
    return { stageKey: "healthy", stageLabel: "Healthy", stageIndex: 1 };
  }
  if (line.includes("Deployment v42 recorded")) {
    return { stageKey: "deployment", stageLabel: "Deployment", stageIndex: 2 };
  }
  if (line.includes("Third degraded interval matured")) {
    return { stageKey: "degradation", stageLabel: "Degradation", stageIndex: 3 };
  }
  if (line.includes("Incident persisted") || line.startsWith("INCIDENT_ID:")) {
    return { stageKey: "incident_detected", stageLabel: "Incident detected", stageIndex: 4 };
  }
  if (line.includes("Deployment v43 recorded")) {
    return { stageKey: "corrective_deployment", stageLabel: "Corrective deployment", stageIndex: 5 };
  }
  if (line.includes("Campaign recovered")) {
    return { stageKey: "recovery_verified", stageLabel: "Recovery verified", stageIndex: 6 };
  }

  return null;
}

export function getOrCreateDemoSession(request: NextRequest): { sessionId: string; isNew: boolean } {
  const existing = request.cookies.get(SESSION_COOKIE)?.value;
  if (existing && existing.length >= 16) {
    return { sessionId: existing, isNew: false };
  }

  return { sessionId: randomUUID(), isNew: true };
}

export function attachDemoSessionCookie(response: NextResponse, sessionId: string): NextResponse {
  const env = getEnv();
  response.cookies.set(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });

  return response;
}

async function cleanupExpiredDemoRuns(): Promise<void> {
  await query(
    `update demo_runs
     set status = 'failed',
         public_reference = coalesce(public_reference, 'CD-STUCK'),
         public_message = coalesce(public_message, 'Replay did not complete and was marked failed.'),
         completed_at = coalesce(completed_at, now()),
         updated_at = now()
     where operation = 'replay'
       and status = 'running'
       and started_at < now() - interval '45 seconds'`,
  );

  await query(`delete from demo_runs where expires_at <= now()`);
}

async function latestRunWithinCooldown(sessionId: string, operation: DemoOperation, cooldownSeconds: number) {
  return queryOne<{ id: string }>(
    `select id
     from demo_runs
     where session_id = $1
       and operation = $2
       and started_at >= now() - make_interval(secs => $3)
     order by started_at desc
     limit 1`,
    [sessionId, operation, cooldownSeconds],
  );
}

async function getRunningReplay() {
  return queryOne<{ id: string; session_id: string }>(
    `select id, session_id
     from demo_runs
     where operation = 'replay' and status = 'running'
     order by started_at desc
     limit 1`,
  );
}

async function insertDemoRun(params: {
  sessionId: string;
  operation: DemoOperation;
  status: DemoRunStatus;
  stageKey: string;
  stageLabel: string;
  stageIndex: number;
  stageTotal: number;
}): Promise<string> {
  const row = await queryOne<{ id: string }>(
    `insert into demo_runs (
      session_id,
      operation,
      status,
      stage_key,
      stage_label,
      stage_index,
      stage_total,
      log_lines,
      expires_at
    )
    values ($1, $2, $3, $4, $5, $6, $7, '[]'::jsonb, now() + interval '6 hour')
    returning id`,
    [
      params.sessionId,
      params.operation,
      params.status,
      params.stageKey,
      params.stageLabel,
      params.stageIndex,
      params.stageTotal,
    ],
  );

  if (!row?.id) {
    throw new Error("Failed to create demo run record.");
  }

  return row.id;
}

async function appendRunLine(runId: string, line: string): Promise<void> {
  const stage = classifyStage(line);
  const rawIncidentId = line.startsWith("INCIDENT_ID:") ? line.replace("INCIDENT_ID:", "").trim() : null;
  const rawIncidentUrl = line.startsWith("INCIDENT_URL:") ? line.replace("INCIDENT_URL:", "").trim() : null;

  const incidentId = rawIncidentId;
  const incidentUrl = rawIncidentUrl;

  await query(
    `update demo_runs
     set stage_key = coalesce($2, stage_key),
         stage_label = coalesce($3, stage_label),
         stage_index = greatest(stage_index, coalesce($4, stage_index)),
         incident_id = coalesce($5, incident_id),
         incident_url = coalesce($6, incident_url),
         log_lines = coalesce(log_lines, '[]'::jsonb) || to_jsonb(array[$7]::text[]),
         updated_at = now()
     where id = $1`,
    [runId, stage?.stageKey ?? null, stage?.stageLabel ?? null, stage?.stageIndex ?? null, incidentId, incidentUrl, line],
  );
}

async function completeReplayRun(runId: string): Promise<void> {
  await query(
    `update demo_runs
     set status = 'completed',
         stage_key = 'recovery_verified',
         stage_label = 'Recovery verified',
         stage_index = 6,
         completed_at = now(),
         updated_at = now()
     where id = $1`,
    [runId],
  );
}

async function failReplayRun(runId: string, reference: string): Promise<void> {
  await query(
    `update demo_runs
     set status = 'failed',
         public_reference = $2,
         public_message = 'Replay failed before completion. Retry with support reference.',
         completed_at = now(),
         updated_at = now()
     where id = $1`,
    [runId, reference],
  );
}

async function markResetCompleted(sessionId: string): Promise<void> {
  await insertDemoRun({
    sessionId,
    operation: "reset",
    status: "completed",
    stageKey: "reset",
    stageLabel: "Demo reset complete",
    stageIndex: 0,
    stageTotal: 0,
  });
}

export async function startReplayForSession(
  sessionId: string,
  options?: { forceFailure?: boolean },
): Promise<
  | { ok: true; runId: string }
  | { ok: false; status: 409 | 429; code: string; message: string }
> {
  await cleanupExpiredDemoRuns();

  const result = await withAdvisoryLock(DEMO_LOCK_ID, async () => {
    const running = await getRunningReplay();
    if (running) {
      return {
        ok: false as const,
        status: 409 as const,
        code: running.session_id === sessionId ? "DEMO_REPLAY_ALREADY_RUNNING" : "DEMO_REPLAY_BUSY",
        message: "Replay is already running. Retry after the active run reaches a terminal state.",
      };
    }

    const throttled = await latestRunWithinCooldown(sessionId, "replay", REPLAY_COOLDOWN_SECONDS);
    if (throttled) {
      return {
        ok: false as const,
        status: 429 as const,
        code: "DEMO_REPLAY_THROTTLED",
        message: "Replay requests are rate-limited. Retry shortly.",
      };
    }

    const runId = await insertDemoRun({
      sessionId,
      operation: "replay",
      status: "running",
      stageKey: "starting",
      stageLabel: "Starting replay",
      stageIndex: 0,
      stageTotal: 6,
    });

    return { ok: true as const, runId };
  });

  if (!result.acquired || !result.result) {
    return {
      ok: false,
      status: 409,
      code: "DEMO_REPLAY_LOCKED",
      message: "Replay startup lock is busy. Retry shortly.",
    };
  }

  if (!result.result.ok) {
    return result.result;
  }

  const runId = result.result.runId;

  void (async () => {
    try {
      if (options?.forceFailure) {
        throw new Error("forced_replay_failure");
      }

      await runDemoReplay({
        onStage: async (line) => {
          await appendRunLine(runId, line);
        },
      });
      await completeReplayRun(runId);
    } catch (error) {
      const reference = buildPublicErrorReference();
      logger.error("demo-replay-failed", {
        runId,
        reference,
        error: error instanceof Error ? error.message : "unknown",
        operation: "demo.replay",
      });
      await failReplayRun(runId, reference);
    }
  })();

  return { ok: true, runId };
}

export async function resetForSession(sessionId: string, resetAction: () => Promise<void>): Promise<
  | { ok: true }
  | { ok: false; status: 409 | 429; code: string; message: string }
> {
  await cleanupExpiredDemoRuns();

  const result = await withAdvisoryLock(DEMO_LOCK_ID, async () => {
    const running = await getRunningReplay();
    if (running) {
      return {
        ok: false as const,
        status: 409 as const,
        code: running.session_id === sessionId ? "DEMO_RESET_BLOCKED_BY_ACTIVE_REPLAY" : "DEMO_RESET_BLOCKED_OTHER_SESSION",
        message: "Reset is blocked while replay is active.",
      };
    }

    const throttled = await latestRunWithinCooldown(sessionId, "reset", RESET_COOLDOWN_SECONDS);
    if (throttled) {
      return {
        ok: false as const,
        status: 429 as const,
        code: "DEMO_RESET_THROTTLED",
        message: "Reset requests are rate-limited. Retry shortly.",
      };
    }

    await resetAction();
    await markResetCompleted(sessionId);
    return { ok: true as const };
  });

  if (!result.acquired || !result.result) {
    return {
      ok: false,
      status: 409,
      code: "DEMO_RESET_LOCKED",
      message: "Reset lock is busy. Retry shortly.",
    };
  }

  return result.result;
}

export async function getReplayRunForSession(runId: string, sessionId: string): Promise<DemoRunRecord | null> {
  const run = await queryOne<DemoRunRecord>(
    `select
      dr.id,
      dr.session_id,
      dr.operation,
      dr.status,
      dr.stage_key,
      dr.stage_label,
      dr.stage_index,
      dr.stage_total,
      case when i.id is null then null else dr.incident_id end as incident_id,
      case when i.id is null then null else dr.incident_url end as incident_url,
      coalesce(dr.log_lines, '[]'::jsonb) as log_lines,
      dr.public_reference,
      dr.public_message,
      dr.started_at,
      dr.completed_at
     from demo_runs dr
     left join incidents i on i.id = dr.incident_id
     where dr.id = $1 and dr.session_id = $2 and dr.operation = 'replay'
     limit 1`,
    [runId, sessionId],
  );

  if (!run) {
    return null;
  }

  if (run.incident_id && !(await incidentExists(run.incident_id))) {
    return {
      ...run,
      incident_id: null,
      incident_url: null,
    };
  }

  return run;
}
