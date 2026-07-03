import { differenceInMinutes } from "date-fns";

export type SourceFreshnessRecord = {
  source: string;
  expectedDelayMinutes: number;
  lastSuccessfulEventAt: Date | null;
  latestMatureIntervalEnd?: Date | null;
  connectorState?: "healthy" | "stale" | "failed" | null;
};

export function computeFreshnessState(record: SourceFreshnessRecord, now: Date): "healthy" | "stale" {
  if (!record.lastSuccessfulEventAt) {
    return "stale";
  }

  const ageMinutes = differenceInMinutes(now, record.lastSuccessfulEventAt);
  return ageMinutes <= record.expectedDelayMinutes ? "healthy" : "stale";
}

export type DerivedFreshnessState =
  | "fresh"
  | "delayed"
  | "stale"
  | "connector_unavailable";

export type DerivedFreshness = {
  source: string;
  state: DerivedFreshnessState;
  label: "Fresh" | "Delayed" | "Stale" | "Connector unavailable";
  overdueMinutes: number | null;
  suppressesDecisions: boolean;
};

function toOverdueMinutes(now: Date, expectedDelayMinutes: number, timestamp: Date | null): number | null {
  if (!timestamp) {
    return null;
  }

  const ageMinutes = differenceInMinutes(now, timestamp);
  return Math.max(0, ageMinutes - expectedDelayMinutes);
}

export function deriveSourceFreshness(record: SourceFreshnessRecord, now: Date): DerivedFreshness {
  if (record.connectorState && record.connectorState !== "healthy") {
    return {
      source: record.source,
      state: "connector_unavailable",
      label: "Connector unavailable",
      overdueMinutes: toOverdueMinutes(now, record.expectedDelayMinutes, record.lastSuccessfulEventAt),
      suppressesDecisions: true,
    };
  }

  if (!record.lastSuccessfulEventAt) {
    return {
      source: record.source,
      state: "stale",
      label: "Stale",
      overdueMinutes: null,
      suppressesDecisions: true,
    };
  }

  const freshnessState = computeFreshnessState(record, now);
  if (freshnessState === "healthy") {
    return {
      source: record.source,
      state: "fresh",
      label: "Fresh",
      overdueMinutes: 0,
      suppressesDecisions: false,
    };
  }

  if (record.latestMatureIntervalEnd) {
    const matureAgeMinutes = differenceInMinutes(now, record.latestMatureIntervalEnd);
    // Boundary rule: if mature intervals are still within expected delay, decisions remain enabled
    // even when the latest event is delayed, because deterministic evaluation still has complete input.
    if (matureAgeMinutes <= record.expectedDelayMinutes) {
      return {
        source: record.source,
        state: "delayed",
        label: "Delayed",
        overdueMinutes: toOverdueMinutes(now, record.expectedDelayMinutes, record.lastSuccessfulEventAt),
        suppressesDecisions: false,
      };
    }
  }

  return {
    source: record.source,
    state: "stale",
    label: "Stale",
    overdueMinutes: toOverdueMinutes(now, record.expectedDelayMinutes, record.lastSuccessfulEventAt),
    suppressesDecisions: true,
  };
}
