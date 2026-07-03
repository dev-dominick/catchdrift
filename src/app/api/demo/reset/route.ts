import { NextRequest, NextResponse } from "next/server";
import { ensureDemoWorkspaceAndCampaign, resetDemoWorkspace } from "@/domain/engine";
import {
  attachDemoSessionCookie,
  getOrCreateDemoSession,
  resetForSession,
} from "@/demo/runtime";

export async function POST(request: NextRequest) {
  const { sessionId } = getOrCreateDemoSession(request);
  try {
    const result = await resetForSession(sessionId, async () => {
      await resetDemoWorkspace();
      await ensureDemoWorkspaceAndCampaign();
    });

    if (!result.ok) {
      const response = NextResponse.json(
        {
          error: {
            code: result.code,
            message: result.message,
          },
        },
        { status: result.status },
      );
      return attachDemoSessionCookie(response, sessionId);
    }

    const response = NextResponse.json(
      { ok: true, message: "Demo workspace reset" },
      { status: 200 },
    );
    return attachDemoSessionCookie(response, sessionId);
  } catch {
    const reference = `CD-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const response = NextResponse.json(
      {
        error: {
          code: "DEMO_RESET_FAILED",
          message: `Reset could not be completed. Retry with reference ${reference}.`,
        },
      },
      { status: 503 },
    );
    return attachDemoSessionCookie(response, sessionId);
  }
}
