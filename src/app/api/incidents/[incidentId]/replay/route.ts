import { NextRequest, NextResponse } from "next/server";
import { runDemoReplay } from "@/demo/scenario";
import { withAdvisoryLock } from "@/db/sql";

const DEMO_LOCK_ID = 4242001;

export async function POST(request: NextRequest) {
  void request;

  const lock = await withAdvisoryLock(DEMO_LOCK_ID, async () =>
    runDemoReplay({
      instant: true,
    }),
  );

  if (!lock.acquired) {
    return NextResponse.json(
      { error: "Demo replay already running. Please retry shortly." },
      { status: 429 },
    );
  }

  return NextResponse.json({ ok: true });
}
