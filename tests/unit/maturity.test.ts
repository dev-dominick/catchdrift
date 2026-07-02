import { describe, expect, it } from "vitest";
import { evaluateTrackingIntegrityRule } from "@/domain/tracking-rule";

describe("reporting maturity", () => {
  it("returns normal when insufficient mature intervals exist", () => {
    const result = evaluateTrackingIntegrityRule({ intervals: [], fresh: true });
    expect(result.result).toBe("normal");
    expect(result.suppressionReason).toBe("insufficient_mature_intervals");
  });
});
