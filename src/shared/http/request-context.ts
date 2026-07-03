import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

export function getRequestId(request: NextRequest): string {
  const incoming = request.headers.get("x-request-id");
  if (incoming && incoming.length >= 8 && incoming.length <= 128) {
    return incoming;
  }

  return randomUUID();
}
