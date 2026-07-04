import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { updateIncidentStatus } from "@/domain/engine";
import { queryOne } from "@/db/sql";
import { isIncidentActionAllowed, normalizeIncidentStatus } from "@/domain/incident-action-matrix";
import { errorJson } from "@/shared/http/api-response";
import { getRequestId } from "@/shared/http/request-context";
import { conflictError, dependencyUnavailableError, notFoundError, validationError } from "@/shared/errors/app-error";

const actionSchema = z.object({
  action: z.enum(["acknowledge", "investigate", "dismiss", "resolve"]),
});

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ incidentId: string }> },
) {
  const requestId = getRequestId(request);
  const body = await request.json().catch(() => null);
  const parsed = actionSchema.safeParse(body);

  if (!parsed.success) {
    return errorJson(validationError("INVALID_INCIDENT_ACTION", "Invalid incident action."), {
      requestId,
    });
  }

  const { incidentId } = await context.params;
  try {
    const incident = await queryOne<{ status: string }>(
      `select status::text as status from incidents where id = $1 limit 1`,
      [incidentId],
    );

    if (!incident) {
      return errorJson(notFoundError("INCIDENT_NOT_FOUND", "Incident was not found."), {
        requestId,
      });
    }

    const normalizedStatus = normalizeIncidentStatus(incident.status);
    if (!isIncidentActionAllowed(normalizedStatus, parsed.data.action)) {
      return errorJson(
        conflictError(
          "INCIDENT_ACTION_NOT_ALLOWED",
          `Action '${parsed.data.action}' is not allowed while incident is '${normalizedStatus}'.`,
        ),
        { requestId },
      );
    }

    await updateIncidentStatus({
      incidentId,
      action: parsed.data.action,
    });

    return NextResponse.json({ ok: true });
  } catch {
    return errorJson(
      dependencyUnavailableError("INCIDENT_ACTION_FAILED", "Incident action could not be completed."),
      { requestId },
    );
  }
}
