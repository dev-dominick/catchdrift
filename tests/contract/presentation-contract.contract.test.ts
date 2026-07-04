import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
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
    expect(String(invalid.reason)).toContain("detection must occur at or before fix");
  });

  it("derives exposure categories from one canonical hourly rate", () => {
    const model = deriveExposureModel({
      lowPerHourMinor: DEFAULT_EXPOSURE_RATE_PER_HOUR_MINOR.low,
      highPerHourMinor: DEFAULT_EXPOSURE_RATE_PER_HOUR_MINOR.high,
      deployedAt: "2026-07-04T12:15:00.000Z",
      detectedAt: "2026-07-04T12:25:00.000Z",
    });

    expect(model.detectionDurationMinutes).toBe(10);
    expect(model.beforeDetectionMinor).toEqual({ lowMinor: 3833, highMinor: 5167 });
    expect(model.ninetyMinuteMinor).toEqual({ lowMinor: 34500, highMinor: 46500 });
    expect(model.dailyMinor).toEqual({ lowMinor: 552000, highMinor: 744000 });
  });

  it("labels lifecycle exposure windows from incident timestamps", () => {
    const active = deriveLifecycleExposureDisplay({
      lowPerHourMinor: DEFAULT_EXPOSURE_RATE_PER_HOUR_MINOR.low,
      highPerHourMinor: DEFAULT_EXPOSURE_RATE_PER_HOUR_MINOR.high,
      deployedAt: "2026-07-04T12:15:00.000Z",
      detectedAt: "2026-07-04T12:25:00.000Z",
      status: "detected",
    });

    const recovered = deriveLifecycleExposureDisplay({
      lowPerHourMinor: DEFAULT_EXPOSURE_RATE_PER_HOUR_MINOR.low,
      highPerHourMinor: DEFAULT_EXPOSURE_RATE_PER_HOUR_MINOR.high,
      deployedAt: "2026-07-04T12:15:00.000Z",
      detectedAt: "2026-07-04T12:25:00.000Z",
      recoveredAt: "2026-07-04T12:45:00.000Z",
      status: "recovered",
    });

    expect(active).toMatchObject({
      label: PRESENTATION_COPY.exposureLabels.beforeDetection,
      rangeMinor: { lowMinor: 3833, highMinor: 5167 },
      durationMinutes: 10,
      windowLabel: "deployment to detection",
    });
    expect(recovered).toMatchObject({
      label: "Exposure through recovery",
      rangeMinor: { lowMinor: 11500, highMinor: 15500 },
      durationMinutes: 30,
      windowLabel: "deployment to recovery",
    });
  });

  it("keeps README and submission copy aligned to derived canonical examples", () => {
    const readme = read("README.md");
    const submission = read("SUBMISSION_COPY.md");

    expect(readme).toContain(`Click \`${PRESENTATION_COPY.replayCta}\`.`);
    expect(readme).toContain("Exposure before detection (rate x 10 minutes): $38-$52");
    expect(readme).toContain("Hypothetical exposure with 90-minute delay (rate x 90 minutes): $345-$465");
    expect(readme).toContain("Potential daily exposure (rate x 24 hours): $5,520-$7,440");

    expect(submission).toContain(`Click "${PRESENTATION_COPY.replayCta}".`);
    expect(submission).toContain("Estimated hourly exposure, exposure before detection, hypothetical 90-minute exposure, and potential daily exposure");
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
