import { describe, expect, it } from "vitest";
import { DEMO_SCENARIO, DEMO_STORY } from "@/lib/constants";

describe("demo scenario canonical values", () => {
  it("keeps customer-facing values aligned with legacy story fields", () => {
    expect(DEMO_SCENARIO.detectionDurationMinutes).toBe(DEMO_STORY.detectionMinutes);
    expect(DEMO_SCENARIO.exposureAtDetectionMinor).toBe(DEMO_STORY.exposureDuringDetectionMinor);
    expect(DEMO_SCENARIO.potentialDailyExposureMinor).toBe(DEMO_STORY.potentialDailyExposureMinor);
    expect(DEMO_SCENARIO.deploymentIdentifier).toBe(DEMO_STORY.deploymentId);
    expect(DEMO_SCENARIO.correctiveDeploymentIdentifier).toBe(DEMO_STORY.correctiveDeploymentId);
  });

  it("defines deterministic staged exposure progression", () => {
    const progression = [
      DEMO_SCENARIO.stagedExposureMinor.healthy,
      DEMO_SCENARIO.stagedExposureMinor.degradation,
      DEMO_SCENARIO.stagedExposureMinor.confirmation,
      DEMO_SCENARIO.stagedExposureMinor.detected,
    ];

    expect(progression).toEqual([0, 16000, 32000, 64000]);
    expect(progression[3]).toBe(DEMO_SCENARIO.exposureAtDetectionMinor);
  });
});
