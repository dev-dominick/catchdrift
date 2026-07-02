import { NextRequest } from "next/server";
import { getEnv } from "@/lib/env";

function extractBearerToken(authorization: string | null): string | null {
  if (!authorization) {
    return null;
  }

  const [scheme, token] = authorization.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token;
}

export function assertIngestionAuth(request: NextRequest): { ok: true } | { ok: false; message: string } {
  const token = extractBearerToken(request.headers.get("authorization"));
  const expected = getEnv().INGESTION_TOKEN;

  if (!token || token !== expected) {
    return { ok: false, message: "Unauthorized ingestion request." };
  }

  return { ok: true };
}
