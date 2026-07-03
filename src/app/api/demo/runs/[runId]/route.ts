import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  attachDemoSessionCookie,
  getOrCreateDemoSession,
  getReplayRunForSession,
} from "@/demo/runtime";
import { errorJson } from "@/shared/http/api-response";
import { getRequestId } from "@/shared/http/request-context";
import {
  dependencyUnavailableError,
  notFoundError,
  validationError,
} from "@/shared/errors/app-error";

const runIdSchema = z.uuid();

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ runId: string }> },
) {
  const requestId = getRequestId(request);
  const { sessionId } = getOrCreateDemoSession(request);

  try {
    const { runId } = await context.params;
    const parsedRunId = runIdSchema.safeParse(runId);
    if (!parsedRunId.success) {
      const response = errorJson(validationError("INVALID_RUN_ID", "Invalid demo run identifier."), {
        requestId,
      });
      return attachDemoSessionCookie(response, sessionId);
    }

    const run = await getReplayRunForSession(parsedRunId.data, sessionId);
    if (!run) {
      const response = errorJson(
        notFoundError("DEMO_RUN_NOT_FOUND", "Demo run not found for this session."),
        { requestId },
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
  } catch {
    const response = errorJson(
      dependencyUnavailableError("DEMO_RUN_FETCH_FAILED", "Demo run status is temporarily unavailable."),
      { requestId },
    );
    return attachDemoSessionCookie(response, sessionId);
  }
}
