import "dotenv/config";
import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET as catchAllGet } from "@/app/api/[...path]/route";
import { GET as demoRunGet } from "@/app/api/demo/runs/[runId]/route";
import { GET as liveGet } from "@/app/api/health/live/route";
import { POST as metricsPost } from "@/app/api/ingest/metrics/route";

describe("release hardening contracts", () => {
  it("returns safe envelope for unknown API routes", async () => {
    const request = new NextRequest("http://localhost/api/unknown", { method: "GET" });
    const response = await catchAllGet(request);
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.error.code).toBe("API_ROUTE_NOT_FOUND");
    expect(typeof json.error.requestId).toBe("string");
    expect(String(json.error.message)).not.toMatch(/stack|sql|select|\/Users\//i);
  });

  it("invalid demo run id returns safe validation envelope", async () => {
    const request = new NextRequest("http://localhost/api/demo/runs/not-a-uuid", {
      method: "GET",
    });

    const response = await demoRunGet(request, {
      params: Promise.resolve({ runId: "not-a-uuid" }),
    });
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe("INVALID_RUN_ID");
    expect(typeof json.error.requestId).toBe("string");
    expect(String(json.error.message)).not.toMatch(/stack|sql|select|\/Users\//i);
  });

  it("unauthenticated ingestion does not reveal token details", async () => {
    const request = new NextRequest("http://localhost/api/ingest/metrics", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    const response = await metricsPost(request);
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.error.code).toBe("INGEST_UNAUTHORIZED");
    expect(typeof json.error.requestId).toBe("string");
    expect(String(json.error.message)).not.toMatch(/token|bearer|secret|INGESTION_TOKEN/i);
  });

  it("liveness stays healthy when db probe fails", async () => {
    const response = await liveGet();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.status).toBe("live");
    expect(json.ok).toBe(true);
  });

  it("readiness fails safely when database is unavailable", async () => {
    vi.resetModules();
    vi.doMock("@/db/sql", () => ({
      queryOne: vi.fn(async () => {
        throw new Error("db down");
      }),
    }));

    const { GET } = await import("@/app/api/health/ready/route");
    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json.ok).toBe(false);
    expect(json.status).toBe("not_ready");
    expect(JSON.stringify(json)).not.toMatch(/db down|postgres|password|DATABASE_URL/i);

    vi.doUnmock("@/db/sql");
  });

  it("request id appears in response and structured logs on replay start failure", async () => {
    vi.resetModules();
    const loggerError = vi.fn();

    vi.doMock("@/demo/runtime", () => ({
      attachDemoSessionCookie: (response: Response) => response,
      getOrCreateDemoSession: () => ({ sessionId: "session-1", isNew: false }),
      startReplayForSession: vi.fn(async () => {
        throw new Error("boom");
      }),
    }));

    vi.doMock("@/infrastructure/logging/logger", () => ({
      logger: {
        error: loggerError,
      },
    }));

    const { POST } = await import("@/app/api/demo/replay/route");
    const request = new NextRequest("http://localhost/api/demo/replay", {
      method: "POST",
      headers: {
        "x-request-id": "req_release_contract_123",
      },
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json.error.code).toBe("DEMO_REPLAY_START_FAILED");
    expect(json.error.requestId).toBe("req_release_contract_123");
    expect(loggerError).toHaveBeenCalledTimes(1);
    expect(loggerError.mock.calls[0]?.[1]?.requestId).toBe("req_release_contract_123");

    vi.doUnmock("@/demo/runtime");
    vi.doUnmock("@/infrastructure/logging/logger");
  });

  it("replay start returns a safe conflict when an active incident blocks a new run", async () => {
    vi.resetModules();

    vi.doMock("@/demo/runtime", () => ({
      attachDemoSessionCookie: (response: Response) => response,
      getOrCreateDemoSession: () => ({ sessionId: "session-1", isNew: false }),
      startReplayForSession: vi.fn(async () => ({
        ok: false,
        status: 409,
        code: "DEMO_REPLAY_BLOCKED_BY_ACTIVE_INCIDENT",
        message: "Replay is blocked while an active incident is unresolved. Reset the demo before starting another replay.",
      })),
    }));

    vi.doMock("@/infrastructure/logging/logger", () => ({
      logger: {
        error: vi.fn(),
      },
    }));

    const { POST } = await import("@/app/api/demo/replay/route");
    const request = new NextRequest("http://localhost/api/demo/replay", { method: "POST" });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.error.code).toBe("DEMO_REPLAY_BLOCKED_BY_ACTIVE_INCIDENT");
    expect(String(json.error.message)).toContain("active incident is unresolved");
    expect(JSON.stringify(json)).not.toMatch(/select |insert |update |from |postgres|DATABASE_URL/i);

    vi.doUnmock("@/demo/runtime");
    vi.doUnmock("@/infrastructure/logging/logger");
  });
});
