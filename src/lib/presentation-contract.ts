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
    liveConnectorNotConfigured: "Not connected",
    simulationDataAvailable: "Simulated evidence fresh",
    simulationStale: "Simulated evidence stale",
    simulationMissing: "No simulated evidence",
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

function elapsedWholeMinutes(startAt: string, endAt: string): number {
  return Math.max(0, Math.round((new Date(endAt).getTime() - new Date(startAt).getTime()) / 60_000));
}

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
  const detectionDurationMinutes = elapsedWholeMinutes(params.deployedAt, params.detectedAt);

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

export function deriveLifecycleExposureDisplay(params: {
  lowPerHourMinor: number | null | undefined;
  highPerHourMinor: number | null | undefined;
  deployedAt?: string | null;
  detectedAt?: string | null;
  recoveredAt?: string | null;
  status?: string | null;
}): {
  label: string;
  rangeMinor: { lowMinor: number; highMinor: number };
  durationMinutes: number;
  windowLabel: string;
} | null {
  if (params.lowPerHourMinor == null || params.highPerHourMinor == null || !params.deployedAt) {
    return null;
  }

  const recovered = params.status === "recovered" || params.status === "resolved";
  const endAt = recovered && params.recoveredAt ? params.recoveredAt : params.detectedAt;
  if (!endAt) {
    return null;
  }

  const deployedAt = new Date(params.deployedAt);
  const exposureEndAt = new Date(endAt);
  if (Number.isNaN(deployedAt.getTime()) || Number.isNaN(exposureEndAt.getTime())) {
    return null;
  }

  const durationMinutes = Math.max(0, Math.round((exposureEndAt.getTime() - deployedAt.getTime()) / 60_000));

  return {
    label: recovered && params.recoveredAt ? "Exposure through recovery" : PRESENTATION_COPY.exposureLabels.beforeDetection,
    rangeMinor: exposureRangeForMinutes({
      lowPerHourMinor: params.lowPerHourMinor,
      highPerHourMinor: params.highPerHourMinor,
      minutes: durationMinutes,
    }),
    durationMinutes,
    windowLabel: recovered && params.recoveredAt ? "deployment to recovery" : "deployment to detection",
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
