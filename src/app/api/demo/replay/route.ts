import { NextRequest, NextResponse } from "next/server";
import {
  attachDemoSessionCookie,
  getOrCreateDemoSession,
  startReplayForSession,
} from "@/demo/runtime";
import {
  conflictError,
  dependencyUnavailableError,
  rateLimitError,
} from "@/shared/errors/app-error";
import { errorJson } from "@/shared/http/api-response";
import { getRequestId } from "@/shared/http/request-context";
import { logger } from "@/infrastructure/logging/logger";
import { getEnv } from "@/lib/env";

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  const { sessionId } = getOrCreateDemoSession(request);
  const env = getEnv();
  const forceFailure =
    env.NODE_ENV !== "production" && request.nextUrl.searchParams.get("forceFailure") === "1";
  try {
    const started = await startReplayForSession(sessionId, { forceFailure });

    if (!started.ok) {
      const err =
        started.status === 429
          ? rateLimitError(started.code, started.message)
          : conflictError(started.code, started.message);

      const response = errorJson(err, { requestId });
      return attachDemoSessionCookie(response, sessionId);
    }

    const response = NextResponse.json(
      {
        runId: started.runId,
        status: "accepted",
        message: "Replay accepted and running asynchronously.",
      },
      { status: 202 },
    );

    return attachDemoSessionCookie(response, sessionId);
  } catch {
    logger.error("demo-replay-start-failed", { requestId, sessionId, operation: "demo.replay.start" });
    const response = errorJson(
      dependencyUnavailableError("DEMO_REPLAY_START_FAILED", "Replay could not be started. Retry shortly."),
      { requestId },
    );
    return attachDemoSessionCookie(response, sessionId);
  }
}

export async function GET(request: NextRequest) {
  const { sessionId } = getOrCreateDemoSession(request);
  const response = NextResponse.json(
    {
      sessionId,
      ok: true,
    },
    { status: 200 },
  );

  return attachDemoSessionCookie(response, sessionId);
}
