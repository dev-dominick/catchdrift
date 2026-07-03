import { NextRequest, NextResponse } from "next/server";
import {
  attachDemoSessionCookie,
  getOrCreateDemoSession,
  startReplayForSession,
} from "@/demo/runtime";

export async function POST(request: NextRequest) {
  const { sessionId } = getOrCreateDemoSession(request);
  const forceFailure =
    process.env.NODE_ENV !== "production" && request.nextUrl.searchParams.get("forceFailure") === "1";
  try {
    const started = await startReplayForSession(sessionId, { forceFailure });

    if (!started.ok) {
      const response = NextResponse.json(
        {
          error: {
            code: started.code,
            message: started.message,
          },
        },
        { status: started.status },
      );
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
    const reference = `CD-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const response = NextResponse.json(
      {
        error: {
          code: "DEMO_REPLAY_START_FAILED",
          message: `Replay could not be started. Retry with reference ${reference}.`,
        },
      },
      { status: 503 },
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
