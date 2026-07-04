import { describe, expect, it } from "vitest";
import { DEMO_SCENARIO, DEMO_STORY } from "@/lib/constants";
import {
  DEFAULT_EXPOSURE_RATE_PER_HOUR_MINOR,
  deriveExposureModel,
} from "@/lib/presentation-contract";

describe("demo scenario canonical values", () => {
  it("keeps customer-facing values aligned with legacy story fields", () => {
    expect(DEMO_SCENARIO.detectionDurationMinutes).toBe(DEMO_STORY.detectionMinutes);
    expect(DEMO_SCENARIO.exposureRatePerHourMinor).toEqual(DEMO_STORY.exposureRatePerHourMinor);
    expect(DEMO_SCENARIO.deploymentIdentifier).toBe(DEMO_STORY.deploymentId);
    expect(DEMO_SCENARIO.correctiveDeploymentIdentifier).toBe(DEMO_STORY.correctiveDeploymentId);
  });

  it("derives deterministic exposure values from the canonical hourly range", () => {
    const model = deriveExposureModel({
      lowPerHourMinor: DEFAULT_EXPOSURE_RATE_PER_HOUR_MINOR.low,
      highPerHourMinor: DEFAULT_EXPOSURE_RATE_PER_HOUR_MINOR.high,
      deployedAt: "2026-07-04T12:15:00.000Z",
      detectedAt: "2026-07-04T12:30:00.000Z",
    });

    expect(model.beforeDetectionMinor).toEqual({ lowMinor: 5738, highMinor: 7742 });
    expect(model.dailyMinor).toEqual({ lowMinor: 550872, highMinor: 743208 });
  });
});
