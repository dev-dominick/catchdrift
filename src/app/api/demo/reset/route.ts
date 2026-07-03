import { NextRequest, NextResponse } from "next/server";
import { ensureDemoWorkspaceAndCampaign, resetDemoWorkspace } from "@/domain/engine";
import {
  attachDemoSessionCookie,
  getOrCreateDemoSession,
  resetForSession,
} from "@/demo/runtime";
import {
  conflictError,
  dependencyUnavailableError,
  rateLimitError,
} from "@/shared/errors/app-error";
import { errorJson } from "@/shared/http/api-response";
import { getRequestId } from "@/shared/http/request-context";
import { logger } from "@/infrastructure/logging/logger";

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  const { sessionId } = getOrCreateDemoSession(request);
  try {
    const result = await resetForSession(sessionId, async () => {
      await resetDemoWorkspace();
      await ensureDemoWorkspaceAndCampaign();
    });

    if (!result.ok) {
      const err =
        result.status === 429
          ? rateLimitError(result.code, result.message)
          : conflictError(result.code, result.message);
      const response = errorJson(err, { requestId });
      return attachDemoSessionCookie(response, sessionId);
    }

    const response = NextResponse.json(
      { ok: true, message: "Demo workspace reset" },
      { status: 200 },
    );
    return attachDemoSessionCookie(response, sessionId);
  } catch {
    logger.error("demo-reset-failed", { requestId, sessionId, operation: "demo.reset" });
    const response = errorJson(
      dependencyUnavailableError("DEMO_RESET_FAILED", "Reset could not be completed. Retry shortly."),
      { requestId },
    );
    return attachDemoSessionCookie(response, sessionId);
  }
}
