import { NextResponse } from "next/server";
import { checkReadiness } from "@/infrastructure/observability/health";

export async function GET() {
  const result = await checkReadiness();
  if (!result.ok) {
    return NextResponse.json({ ok: false, status: "not_ready" }, { status: 503 });
  }

  return NextResponse.json({ ok: true, status: "ready" }, { status: 200 });
}
