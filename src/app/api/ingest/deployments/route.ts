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
    return NextResponse.json({
      status: result.status,
      campaignId: result.campaignId,
      workspaceId: result.workspaceId,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Deployment ingestion failed.",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 400 },
    );
  }
}
