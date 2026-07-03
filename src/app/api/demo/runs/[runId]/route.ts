import { NextRequest, NextResponse } from "next/server";
import {
  attachDemoSessionCookie,
  getOrCreateDemoSession,
  getReplayRunForSession,
} from "@/demo/runtime";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ runId: string }> },
) {
  const { runId } = await context.params;
  const { sessionId } = getOrCreateDemoSession(request);

  const run = await getReplayRunForSession(runId, sessionId);
  if (!run) {
    const response = NextResponse.json(
      {
        error: {
          code: "DEMO_RUN_NOT_FOUND",
          message: "Demo run not found for this session.",
        },
      },
      { status: 404 },
    );
    return attachDemoSessionCookie(response, sessionId);
  }

  const response = NextResponse.json(
    {
      runId: run.id,
      status: run.status,
      stage: {
        key: run.stage_key,
        label: run.stage_label,
        index: run.stage_index,
        total: run.stage_total,
      },
      incidentId: run.incident_id,
      incidentUrl: run.incident_url,
      lines: run.log_lines,
      publicReference: run.public_reference,
      publicMessage: run.public_message,
      startedAt: run.started_at,
      completedAt: run.completed_at,
    },
    { status: 200 },
  );

  return attachDemoSessionCookie(response, sessionId);
}
