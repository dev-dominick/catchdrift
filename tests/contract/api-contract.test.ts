import "dotenv/config";
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST as postMetrics } from "@/app/api/ingest/metrics/route";
import { PATCH as patchIncident } from "@/app/api/incidents/[incidentId]/route";
import { GET as getDemoRun } from "@/app/api/demo/runs/[runId]/route";

describe("API contract envelopes", () => {
  it("returns unified unauthorized envelope for ingestion", async () => {
    const request = new NextRequest("http://localhost/api/ingest/metrics", {
      method: "POST",
      body: JSON.stringify({}),
      headers: {
        "content-type": "application/json",
      },
    });

    const response = await postMetrics(request);
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.error.code).toBe("INGEST_UNAUTHORIZED");
    expect(typeof json.error.message).toBe("string");
    expect(typeof json.error.requestId).toBe("string");
  });

  it("returns unified validation envelope for incident action", async () => {
    const request = new NextRequest("http://localhost/api/incidents/inc-1", {
      method: "PATCH",
      body: JSON.stringify({ action: "invalid" }),
      headers: {
        "content-type": "application/json",
      },
    });

    const response = await patchIncident(request, {
      params: Promise.resolve({ incidentId: "inc-1" }),
    });
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe("INVALID_INCIDENT_ACTION");
    expect(typeof json.error.requestId).toBe("string");
  });

  it("returns unified not-found envelope for demo run lookup", async () => {
    const runId = "11111111-1111-4111-8111-111111111111";
    const request = new NextRequest(`http://localhost/api/demo/runs/${runId}`, {
      method: "GET",
    });

    const response = await getDemoRun(request, {
      params: Promise.resolve({ runId }),
    });
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.error.code).toBe("DEMO_RUN_NOT_FOUND");
    expect(typeof json.error.requestId).toBe("string");
  });
});
