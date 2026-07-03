import { NextRequest, NextResponse } from "next/server";
import { assertIngestionAuth } from "@/lib/auth";
import { deploymentIngestSchema } from "@/ingestion/contracts";
import { ingestDeploymentEvent } from "@/domain/engine";
import {
  conflictError,
  dependencyUnavailableError,
  validationError,
} from "@/shared/errors/app-error";
import { errorJson } from "@/shared/http/api-response";
import { getRequestId } from "@/shared/http/request-context";

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  const auth = assertIngestionAuth(request);
  if (!auth.ok) {
    return errorJson(auth.error, { requestId });
  }

  const body = await request.json().catch(() => null);
  const parsed = deploymentIngestSchema.safeParse(body);

  if (!parsed.success) {
    return errorJson(validationError("INVALID_DEPLOYMENT_PAYLOAD", "Invalid deployment payload."), {
      requestId,
    });
  }

  try {
    const result = await ingestDeploymentEvent(parsed.data);

    if (result.status === "conflict") {
      return errorJson(
        conflictError("DEPLOYMENT_CONFLICT", "Incoming deployment payload conflicts with stored revision."),
        { requestId },
      );
    }

    if (result.status === "stale_revision") {
      return errorJson(
        conflictError(
          "DEPLOYMENT_STALE_REVISION",
          "Incoming deployment revision is older than stored revision.",
        ),
        { requestId },
      );
    }

    return NextResponse.json({
      status: result.status,
      campaignId: result.campaignId,
      workspaceId: result.workspaceId,
    });
  } catch {
    return errorJson(
      dependencyUnavailableError("DEPLOYMENT_INGEST_FAILED", "Deployment ingestion failed."),
      { requestId },
    );
  }
}
