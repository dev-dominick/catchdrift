import { NextResponse } from "next/server";
import { queryOne } from "@/db/sql";

export async function GET() {
  try {
    await queryOne("select 1 as ok");
    return NextResponse.json({ ok: true, status: "healthy" });
  } catch {
    return NextResponse.json({ ok: false, status: "unhealthy" }, { status: 500 });
  }
}
