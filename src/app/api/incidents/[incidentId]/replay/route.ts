import { NextRequest, NextResponse } from "next/server";
import {
  attachDemoSessionCookie,
  getOrCreateDemoSession,
  startReplayForSession,
} from "@/demo/runtime";
import { conflictError, rateLimitError } from "@/shared/errors/app-error";
import { errorJson } from "@/shared/http/api-response";
import { getRequestId } from "@/shared/http/request-context";

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  const { sessionId } = getOrCreateDemoSession(request);
  const started = await startReplayForSession(sessionId);

  if (!started.ok) {
    const err =
      started.status === 429
        ? rateLimitError(started.code, started.message)
        : conflictError(started.code, started.message);
    const response = errorJson(err, { requestId });
    return attachDemoSessionCookie(response, sessionId);
  }

  const response = NextResponse.json({ ok: true, runId: started.runId }, { status: 202 });
  return attachDemoSessionCookie(response, sessionId);
}
