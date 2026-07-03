import { NextRequest, NextResponse } from "next/server";
import { assertIngestionAuth } from "@/lib/auth";
import { metricIngestSchema } from "@/ingestion/contracts";
import { ingestMetricObservation } from "@/domain/engine";
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
  const parsed = metricIngestSchema.safeParse(body);

  if (!parsed.success) {
    return errorJson(validationError("INVALID_METRICS_PAYLOAD", "Invalid metrics payload."), { requestId });
  }

  try {
    const result = await ingestMetricObservation(parsed.data);

    if (result.status === "conflict") {
      return errorJson(
        conflictError("INGEST_CONFLICT", "Incoming metric payload conflicts with existing revision."),
        { requestId },
      );
    }

    if (result.status === "stale_revision") {
      return errorJson(
        conflictError("INGEST_STALE_REVISION", "Incoming metric revision is older than the stored revision."),
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
      dependencyUnavailableError("METRICS_INGEST_FAILED", "Metrics ingestion failed."),
      { requestId },
    );
  }
}
