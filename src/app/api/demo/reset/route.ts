import { NextRequest, NextResponse } from "next/server";
import { ensureDemoWorkspaceAndCampaign, resetDemoWorkspace } from "@/domain/engine";
import { withAdvisoryLock } from "@/db/sql";

const DEMO_LOCK_ID = 4242001;

export async function POST(request: NextRequest) {
  void request;

  const lock = await withAdvisoryLock(DEMO_LOCK_ID, async () => {
    await resetDemoWorkspace();
    await ensureDemoWorkspaceAndCampaign();
  });

  if (!lock.acquired) {
    return NextResponse.json(
      { error: "Demo reset is already in progress. Please retry shortly." },
      { status: 429 },
    );
  }

  return NextResponse.json({ ok: true, message: "Demo workspace reset" });
}
