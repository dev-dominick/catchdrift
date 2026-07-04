import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getDeterministicDemoExposureEstimate } from "@/domain/demo-financial";
import {
  DEFAULT_EXPOSURE_RATE_PER_HOUR_MINOR,
  deriveExposureModel,
  deriveLifecycleExposureDisplay,
  PRESENTATION_COPY,
  validateTimelineOrdering,
} from "@/lib/presentation-contract";

const ROOT = path.resolve(__dirname, "../..");

function read(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

describe("presentation contract parity", () => {
  it("keeps the canonical exposure rate aligned with the deterministic product calculation", () => {
    const exposure = getDeterministicDemoExposureEstimate();

    expect(DEFAULT_EXPOSURE_RATE_PER_HOUR_MINOR).toEqual({
      low: Math.round(exposure.low * 100),
      high: Math.round(exposure.high * 100),
    });
  });

  it("enforces canonical timeline ordering invariant", () => {
    const valid = validateTimelineOrdering({
      deploymentAt: "2026-07-04T12:15:00.000Z",
      detectedAt: "2026-07-04T12:25:00.000Z",
      fixedAt: "2026-07-04T12:30:00.000Z",
      recoveredAt: "2026-07-04T12:45:00.000Z",
    });

    const invalid = validateTimelineOrdering({
      deploymentAt: "2026-07-04T12:15:00.000Z",
      detectedAt: "2026-07-04T12:35:00.000Z",
      fixedAt: "2026-07-04T12:30:00.000Z",
      recoveredAt: "2026-07-04T12:45:00.000Z",
    });

    expect(valid.valid).toBe(true);
    expect(invalid.valid).toBe(false);
    expect(String(invalid.reason)).toContain("detection must occur before fix");
  });

  it("derives exposure categories from one canonical hourly rate", () => {
    const model = deriveExposureModel({
      lowPerHourMinor: DEFAULT_EXPOSURE_RATE_PER_HOUR_MINOR.low,
      highPerHourMinor: DEFAULT_EXPOSURE_RATE_PER_HOUR_MINOR.high,
      deployedAt: "2026-07-04T12:15:00.000Z",
      detectedAt: "2026-07-04T12:30:00.000Z",
    });

    expect(model.detectionDurationMinutes).toBe(15);
    expect(model.beforeDetectionMinor).toEqual({ lowMinor: 5738, highMinor: 7742 });
    expect(model.ninetyMinuteMinor).toEqual({ lowMinor: 34430, highMinor: 46451 });
    expect(model.dailyMinor).toEqual({ lowMinor: 550872, highMinor: 743208 });
  });

  it("labels lifecycle exposure windows from incident timestamps", () => {
    const active = deriveLifecycleExposureDisplay({
      lowPerHourMinor: DEFAULT_EXPOSURE_RATE_PER_HOUR_MINOR.low,
      highPerHourMinor: DEFAULT_EXPOSURE_RATE_PER_HOUR_MINOR.high,
      deployedAt: "2026-07-04T12:15:00.000Z",
      detectedAt: "2026-07-04T12:30:00.000Z",
      status: "detected",
    });

    const recovered = deriveLifecycleExposureDisplay({
      lowPerHourMinor: DEFAULT_EXPOSURE_RATE_PER_HOUR_MINOR.low,
      highPerHourMinor: DEFAULT_EXPOSURE_RATE_PER_HOUR_MINOR.high,
      deployedAt: "2026-07-04T12:15:00.000Z",
      detectedAt: "2026-07-04T12:30:00.000Z",
      recoveredAt: "2026-07-04T12:45:00.000Z",
      status: "recovered",
    });

    expect(active).toMatchObject({
      label: PRESENTATION_COPY.exposureLabels.beforeDetection,
      rangeMinor: { lowMinor: 5738, highMinor: 7742 },
      durationMinutes: 15,
      windowLabel: "deployment to detection",
    });
    expect(recovered).toMatchObject({
      label: "Exposure through recovery",
      rangeMinor: { lowMinor: 11477, highMinor: 15484 },
      durationMinutes: 30,
      windowLabel: "deployment to recovery",
    });
  });

  it("keeps README and submission copy aligned to derived canonical examples", () => {
    const readme = read("README.md");
    const submission = read("SUBMISSION_COPY.md");

    expect(readme).toContain(`Click \`${PRESENTATION_COPY.replayCta}\`.`);
    expect(readme).toContain("Exposure before detection (rate x 15 minutes): $57-$77");
    expect(readme).toContain("Hypothetical exposure with 90-minute delay (rate x 90 minutes): $344-$465");
    expect(readme).toContain("Potential full-day exposure projection (rate x 24 hours): $5,509-$7,432");

    expect(submission).toContain(`Click "${PRESENTATION_COPY.replayCta}".`);
    expect(submission).toContain("Estimated hourly exposure, exposure before detection, hypothetical 90-minute exposure, and potential full-day exposure projection");
  });

  it("uses centralized replay CTA and exposure derivations across core presentation surfaces", () => {
    const home = read("src/app/page.tsx");
    const replay = read("src/components/simulation-controls.tsx");
    const incident = read("src/app/incidents/[incidentId]/page.tsx");

    expect(home).toContain("PRESENTATION_COPY.replayCta");
    expect(replay).toContain("PRESENTATION_COPY.replayCta");
    expect(replay).toContain("exposureRangeForMinutes");
    expect(incident).toContain("deriveExposureModel");
  });
});
