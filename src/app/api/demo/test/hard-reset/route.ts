import { NextRequest, NextResponse } from "next/server";
import { ensureDemoWorkspaceAndCampaign, resetDemoWorkspace } from "@/domain/engine";
import { query } from "@/db/sql";

export async function POST(request: NextRequest) {
  void request;

  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await resetDemoWorkspace();
  await ensureDemoWorkspaceAndCampaign();
  await query(`delete from demo_runs`);

  return NextResponse.json({ ok: true });
}
