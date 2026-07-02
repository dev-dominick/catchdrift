import { describe, expect, it } from "vitest";
import { calculateExposureRange } from "@/domain/exposure";

describe("exposure calculation", () => {
  it("produces deterministic $230-$310/hour style range for demo values", () => {
    const baseline = {
      clickToSessionLossPct: 3.9,
      attributionRatePct: 95.2,
      hourlySpend: 900,
      hourlyRevenue: 1260,
    };

    const current = {
      clickToSessionLossPct: 18.1,
      attributionRatePct: 75,
      hourlySpend: 900,
      hourlyRevenue: 864,
      clickLossIncreasePoints: 14.2,
      attributionDeclinePercent: 21.2,
    };

    const result = calculateExposureRange(baseline, current);

    expect(Math.round(result.low)).toBe(230);
    expect(Math.round(result.high)).toBe(310);
  });
});
