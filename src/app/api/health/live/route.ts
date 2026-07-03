import { NextResponse } from "next/server";
import { checkLiveness } from "@/infrastructure/observability/health";

export async function GET() {
  const result = await checkLiveness();
  return NextResponse.json({ ok: result.ok, status: "live" }, { status: 200 });
}
