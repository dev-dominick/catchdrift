import { NextRequest, NextResponse } from "next/server";
import { assertIngestionAuth } from "@/lib/auth";
import { deploymentIngestSchema } from "@/ingestion/contracts";
import { ingestDeploymentEvent } from "@/domain/engine";

export async function POST(request: NextRequest) {
  const auth = assertIngestionAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = deploymentIngestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid deployment payload.",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  try {
    const result = await ingestDeploymentEvent(parsed.data);

    if (result.status === "conflict") {
      return NextResponse.json(
        {
          error: {
            code: "DEPLOYMENT_CONFLICT",
            message: "Incoming deployment payload conflicts with stored revision.",
          },
          campaignId: result.campaignId,
          workspaceId: result.workspaceId,
        },
        { status: 409 },
      );
    }

    if (result.status === "stale_revision") {
      return NextResponse.json(
        {
          error: {
            code: "DEPLOYMENT_STALE_REVISION",
            message: "Incoming deployment revision is older than stored revision.",
          },
          campaignId: result.campaignId,
          workspaceId: result.workspaceId,
        },
        { status: 409 },
      );
    }

    return NextResponse.json({
      status: result.status,
      campaignId: result.campaignId,
      workspaceId: result.workspaceId,
    });
  } catch {
    return NextResponse.json(
      {
        error: "Deployment ingestion failed.",
      },
      { status: 503 },
    );
  }
}
