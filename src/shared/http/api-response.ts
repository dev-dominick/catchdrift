import { NextResponse } from "next/server";
import { asAppError } from "@/shared/errors/app-error";

export type RequestContext = {
  requestId: string;
};

export function successJson<T>(body: T, status = 200): NextResponse {
  return NextResponse.json(body, { status });
}

export function errorJson(error: unknown, context: RequestContext): NextResponse {
  const appError = asAppError(error);

  return NextResponse.json(
    {
      error: {
        code: appError.code,
        message: appError.message,
        requestId: context.requestId,
      },
    },
    { status: appError.status },
  );
}
