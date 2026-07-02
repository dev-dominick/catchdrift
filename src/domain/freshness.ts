import { differenceInMinutes } from "date-fns";

export type SourceFreshnessRecord = {
  source: string;
  expectedDelayMinutes: number;
  lastSuccessfulEventAt: Date | null;
};

export function computeFreshnessState(record: SourceFreshnessRecord, now: Date): "healthy" | "stale" {
  if (!record.lastSuccessfulEventAt) {
    return "stale";
  }

  const ageMinutes = differenceInMinutes(now, record.lastSuccessfulEventAt);
  return ageMinutes <= record.expectedDelayMinutes ? "healthy" : "stale";
}
