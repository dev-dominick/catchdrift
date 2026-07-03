import { timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";
import { getEnv } from "@/lib/env";
import { unauthorizedError, type AppError } from "@/shared/errors/app-error";

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

function safeTokenEquals(input: string, expected: string): boolean {
  const a = Buffer.from(input);
  const b = Buffer.from(expected);

  if (a.length !== b.length) {
    return false;
  }

  return timingSafeEqual(a, b);
}

export function assertIngestionAuth(request: NextRequest): { ok: true } | { ok: false; error: AppError } {
  const token = extractBearerToken(request.headers.get("authorization"));
  const expected = getEnv().INGESTION_TOKEN;

  if (!token || !safeTokenEquals(token, expected)) {
    return {
      ok: false,
      error: unauthorizedError("INGEST_UNAUTHORIZED", "Unauthorized ingestion request."),
    };
  }

  return { ok: true };
}
