import type { Baseline, IntervalAggregate } from "@/domain/types";

export function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }

  return sorted[mid];
}

export function clickToSessionLossPct(paidClicks: number, sessions: number): number {
  if (paidClicks <= 0) {
    return 0;
  }

  return ((paidClicks - sessions) / paidClicks) * 100;
}

export function attributionRatePct(attributedConversions: number, internalSubmissions: number): number {
  if (internalSubmissions <= 0) {
    return 0;
  }

  return (attributedConversions / internalSubmissions) * 100;
}

export function toHourly(valuePerFiveMinutes: number): number {
  return valuePerFiveMinutes * 12;
}

export function buildBaseline(intervals: IntervalAggregate[]): Baseline {
  return {
    clickToSessionLossPct: median(
      intervals.map((i) => clickToSessionLossPct(i.paidClicks, i.sessions)),
    ),
    attributionRatePct: median(
      intervals.map((i) => attributionRatePct(i.attributedConversions, i.internalSubmissions)),
    ),
    hourlySpend: median(intervals.map((i) => toHourly(i.spend))),
    hourlyRevenue: median(intervals.map((i) => toHourly(i.revenue))),
  };
}
