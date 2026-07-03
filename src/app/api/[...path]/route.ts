import { NextRequest } from "next/server";
import { notFoundError } from "@/shared/errors/app-error";
import { errorJson } from "@/shared/http/api-response";
import { getRequestId } from "@/shared/http/request-context";

function notFoundResponse(request: NextRequest) {
  return errorJson(notFoundError("API_ROUTE_NOT_FOUND", "API route not found."), {
    requestId: getRequestId(request),
  });
}

export async function GET(request: NextRequest) {
  return notFoundResponse(request);
}

export async function POST(request: NextRequest) {
  return notFoundResponse(request);
}

export async function PUT(request: NextRequest) {
  return notFoundResponse(request);
}

export async function PATCH(request: NextRequest) {
  return notFoundResponse(request);
}

export async function DELETE(request: NextRequest) {
  return notFoundResponse(request);
}
