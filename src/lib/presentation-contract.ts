import { differenceInMinutes } from "date-fns";
import { addMinutes } from "date-fns";

export const PRESENTATION_COPY = {
  replayCta: "Run incident simulation",
  timelineLabels: {
    deployment: "Deployment",
    incidentDetected: "Incident detected",
    fixApplied: "Fix applied",
    recoveryVerified: "Recovery verified",
  },
  exposureLabels: {
    beforeDetection: "Exposure before detection",
    hourlyRate: "Estimated hourly exposure",
    hypotheticalNinetyMinute: "Hypothetical exposure with a 90-minute reporting delay",
    potentialDaily: "Potential daily exposure",
  },
  sourceStatusLabels: {
    dataMode: "Simulation",
    liveConnectorNotConfigured: "Not configured",
    simulationDataAvailable: "Data available",
    simulationStale: "Stale simulated data",
    simulationMissing: "No simulated data",
  },
} as const;

export const DEFAULT_EXPOSURE_RATE_PER_HOUR_MINOR = {
  low: 23000,
  high: 31000,
} as const;

export const CANONICAL_REPLAY_TIMELINE_OFFSETS_MINUTES = {
  deployment: 60,
  detection: 70,
  fix: 75,
  recovery: 90,
} as const;

export type TimelineEventTimestamps = {
  deploymentAt: string;
  detectedAt: string;
  fixedAt: string;
  recoveredAt: string;
};

export type TimelineInvariantResult = {
  valid: boolean;
  reason?: string;
};

export function validateTimelineOrdering(events: TimelineEventTimestamps): TimelineInvariantResult {
  const deployedAt = new Date(events.deploymentAt).getTime();
  const detectedAt = new Date(events.detectedAt).getTime();
  const fixedAt = new Date(events.fixedAt).getTime();
  const recoveredAt = new Date(events.recoveredAt).getTime();

  if ([deployedAt, detectedAt, fixedAt, recoveredAt].some((value) => Number.isNaN(value))) {
    return { valid: false, reason: "timeline contains invalid timestamp values" };
  }

  if (!(deployedAt < detectedAt)) {
    return { valid: false, reason: "deployment must occur before detection" };
  }

  if (!(detectedAt <= fixedAt)) {
    return { valid: false, reason: "detection must occur at or before fix" };
  }

  if (!(fixedAt < recoveredAt)) {
    return { valid: false, reason: "fix must occur before recovery" };
  }

  return { valid: true };
}

export function exposureRangeForMinutes(params: {
  lowPerHourMinor: number;
  highPerHourMinor: number;
  minutes: number;
}): { lowMinor: number; highMinor: number } {
  const boundedMinutes = Math.max(0, params.minutes);
  return {
    lowMinor: Math.round((params.lowPerHourMinor * boundedMinutes) / 60),
    highMinor: Math.round((params.highPerHourMinor * boundedMinutes) / 60),
  };
}

export function deriveExposureModel(params: {
  lowPerHourMinor: number;
  highPerHourMinor: number;
  deployedAt: string;
  detectedAt: string;
}): {
  detectionDurationMinutes: number;
  beforeDetectionMinor: { lowMinor: number; highMinor: number };
  ninetyMinuteMinor: { lowMinor: number; highMinor: number };
  dailyMinor: { lowMinor: number; highMinor: number };
} {
  const detectionDurationMinutes = Math.max(
    0,
    differenceInMinutes(new Date(params.detectedAt), new Date(params.deployedAt)),
  );

  return {
    detectionDurationMinutes,
    beforeDetectionMinor: exposureRangeForMinutes({
      lowPerHourMinor: params.lowPerHourMinor,
      highPerHourMinor: params.highPerHourMinor,
      minutes: detectionDurationMinutes,
    }),
    ninetyMinuteMinor: exposureRangeForMinutes({
      lowPerHourMinor: params.lowPerHourMinor,
      highPerHourMinor: params.highPerHourMinor,
      minutes: 90,
    }),
    dailyMinor: exposureRangeForMinutes({
      lowPerHourMinor: params.lowPerHourMinor,
      highPerHourMinor: params.highPerHourMinor,
      minutes: 24 * 60,
    }),
  };
}

export function deriveReplayTimelineTimestamps(replayStart: Date): TimelineEventTimestamps {
  return {
    deploymentAt: addMinutes(replayStart, CANONICAL_REPLAY_TIMELINE_OFFSETS_MINUTES.deployment).toISOString(),
    detectedAt: addMinutes(replayStart, CANONICAL_REPLAY_TIMELINE_OFFSETS_MINUTES.detection).toISOString(),
    fixedAt: addMinutes(replayStart, CANONICAL_REPLAY_TIMELINE_OFFSETS_MINUTES.fix).toISOString(),
    recoveredAt: addMinutes(replayStart, CANONICAL_REPLAY_TIMELINE_OFFSETS_MINUTES.recovery).toISOString(),
  };
}
