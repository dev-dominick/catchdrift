import { NextRequest, NextResponse } from "next/server";
import {
  attachDemoSessionCookie,
  getOrCreateDemoSession,
  startReplayForSession,
} from "@/demo/runtime";

export async function POST(request: NextRequest) {
  const { sessionId } = getOrCreateDemoSession(request);
  const started = await startReplayForSession(sessionId);

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

  const response = NextResponse.json({ ok: true, runId: started.runId }, { status: 202 });
  return attachDemoSessionCookie(response, sessionId);
}
