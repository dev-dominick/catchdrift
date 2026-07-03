import { afterEach, describe, expect, it, vi } from "vitest";
import { generateBuyerBrief, type BuyerBriefEvidencePayload } from "@/lib/buyer-brief";

const baseEvidence: BuyerBriefEvidencePayload = {
  campaignName: "Meta / Auto Insurance / Campaign 211",
  incidentStatus: "detected",
  severity: "high",
  confidence: "high",
  exposure: {
    lowMinor: 22953,
    highMinor: 30967,
    currency: "USD",
  },
  baseline: {
    hourlySpend: 900,
    hourlyRevenue: 1260,
    attributionRatePct: 95.2,
    clickToSessionLossPct: 3.9,
  },
  metric: {
    current: {
      hourlySpend: 900,
      hourlyRevenue: 864,
      attributionRatePct: 75,
      clickToSessionLossPct: 18.1,
      clickLossIncreasePoints: 14.2,
      attributionDeclinePercent: 21.25,
    },
    degradedStreakCount: 3,
    evaluationWindowStart: "2026-07-02T23:52:44.000Z",
    evaluationWindowEnd: "2026-07-03T00:07:44.000Z",
  },
  deployment: {
    version: "v42",
    deployedAt: "2026-07-02T23:52:44.137Z",
    scoreBand: "strong",
    scoreTotal: 100,
    changedPaths: ["redirectUrl"],
  },
  threshold: {
    clickLossIncreasePoints: 8,
    attributionDeclinePercent: 12,
    persistenceIntervals: 3,
  },
};

describe("generateBuyerBrief", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.OPENAI_API_KEY;
  });

  it("returns deterministic fallback when no model key is configured", async () => {
    const result = await generateBuyerBrief(baseEvidence);

    expect(result.mode).toBe("fallback");
    expect(result.label).toBe("Deterministic investigation brief");
    expect(result.reason).toMatch(/OPENAI_API_KEY missing/);
  });

  it("returns ai result when output matches schema", async () => {
    process.env.OPENAI_API_KEY = "test-key";

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  summary: "Spend remained active while attribution declined after deployment v42.",
                  competingInterpretations: [
                    "Tracking forwarding changed after deployment.",
                    "Attribution lag may be contributing.",
                  ],
                  prioritizedSteps: [
                    "Check click-ID forwarding.",
                    "Compare payload changes.",
                    "Validate conversions against internal submissions.",
                  ],
                  caution: "Correlation is not causation.",
                }),
              },
            },
          ],
        }),
      }),
    );

    const result = await generateBuyerBrief(baseEvidence);

    expect(result.mode).toBe("ai");
    expect(result.label).toBe("AI-generated investigation brief");
    expect(result.summary).toMatch(/deployment v42/i);
  });

  it("falls back when model output fails schema validation", async () => {
    process.env.OPENAI_API_KEY = "test-key";

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({ summary: "missing required arrays" }),
              },
            },
          ],
        }),
      }),
    );

    const result = await generateBuyerBrief(baseEvidence);

    expect(result.mode).toBe("fallback");
    expect(result.reason).toMatch(/schema validation/);
  });

  it("falls back when request times out or fails", async () => {
    process.env.OPENAI_API_KEY = "test-key";

    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network timeout")),
    );

    const result = await generateBuyerBrief(baseEvidence, { timeoutMs: 10 });

    expect(result.mode).toBe("fallback");
    expect(result.reason).toMatch(/timed out or failed/);
  });
});
