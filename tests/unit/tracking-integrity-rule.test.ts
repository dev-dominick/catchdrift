import { describe, expect, it } from "vitest";
import { evaluateTrackingIntegrityRule } from "@/domain/tracking-rule";
import type { IntervalAggregate } from "@/domain/types";

function interval(
  index: number,
  values: {
    spend: number;
    paidClicks: number;
    sessions: number;
    submissions: number;
    attributed: number;
    revenue: number;
  },
): IntervalAggregate {
  const start = new Date(Date.UTC(2026, 0, 1, 0, index * 5, 0));
  const end = new Date(Date.UTC(2026, 0, 1, 0, index * 5 + 5, 0));

  return {
    intervalStart: start,
    intervalEnd: end,
    spend: values.spend,
    paidClicks: values.paidClicks,
    sessions: values.sessions,
    internalSubmissions: values.submissions,
    attributedConversions: values.attributed,
    revenue: values.revenue,
  };
}

function healthy(index: number): IntervalAggregate {
  return interval(index, {
    spend: 75,
    paidClicks: 410,
    sessions: 394,
    submissions: 42,
    attributed: 40,
    revenue: 105,
  });
}

function degraded(index: number): IntervalAggregate {
  return interval(index, {
    spend: 75,
    paidClicks: 415,
    sessions: 340,
    submissions: 40,
    attributed: 30,
    revenue: 72,
  });
}

describe("tracking_integrity_failure@1", () => {
  it("does not trigger with only two degraded mature intervals", () => {
    const intervals = [...Array.from({ length: 12 }, (_, i) => healthy(i)), degraded(12), degraded(13)];

    const result = evaluateTrackingIntegrityRule({ intervals, fresh: true });
    expect(result.result).toBe("normal");
  });

  it("triggers with three degraded mature intervals", () => {
    const intervals = [
      ...Array.from({ length: 12 }, (_, i) => healthy(i)),
      degraded(12),
      degraded(13),
      degraded(14),
    ];

    const result = evaluateTrackingIntegrityRule({ intervals, fresh: true });
    expect(result.result).toBe("triggered");
    expect(result.degradedStreakCount).toBe(3);
  });

  it("suppresses when required source is stale", () => {
    const intervals = [
      ...Array.from({ length: 12 }, (_, i) => healthy(i)),
      degraded(12),
      degraded(13),
      degraded(14),
    ];

    const result = evaluateTrackingIntegrityRule({
      intervals,
      fresh: false,
      staleReason: "revenue source is stale",
    });

    expect(result.result).toBe("suppressed");
    expect(result.suppressionReason).toContain("stale");
  });

  it("boundary: 7.99 click-loss increase does not trigger", () => {
    const base = {
      spend: 75,
      paidClicks: 410,
      sessions: 361.241,
      submissions: 40,
      attributed: 30,
      revenue: 72,
    };

    const intervals = [
      ...Array.from({ length: 12 }, (_, i) => healthy(i)),
      interval(12, base),
      interval(13, base),
      interval(14, base),
    ];

    const result = evaluateTrackingIntegrityRule({ intervals, fresh: true });
    expect(result.result).toBe("normal");
  });

  it("boundary: 8.00 click-loss increase is eligible", () => {
    const base = {
      spend: 75,
      paidClicks: 410,
      sessions: 361.2,
      submissions: 40,
      attributed: 30,
      revenue: 72,
    };

    const intervals = [
      ...Array.from({ length: 12 }, (_, i) => healthy(i)),
      interval(12, base),
      interval(13, base),
      interval(14, base),
    ];

    const result = evaluateTrackingIntegrityRule({ intervals, fresh: true });
    expect(result.result).toBe("triggered");
  });

  it("boundary: 11.99 attribution decline does not trigger", () => {
    const base = {
      spend: 75,
      paidClicks: 415,
      sessions: 340,
      submissions: 40,
      attributed: 33.5276,
      revenue: 72,
    };

    const intervals = [
      ...Array.from({ length: 12 }, (_, i) => healthy(i)),
      interval(12, base),
      interval(13, base),
      interval(14, base),
    ];

    const result = evaluateTrackingIntegrityRule({ intervals, fresh: true });
    expect(result.result).toBe("normal");
  });

  it("boundary: 12.00 attribution decline is eligible", () => {
    const base = {
      spend: 75,
      paidClicks: 415,
      sessions: 340,
      submissions: 40,
      attributed: 33.5238,
      revenue: 72,
    };

    const intervals = [
      ...Array.from({ length: 12 }, (_, i) => healthy(i)),
      interval(12, base),
      interval(13, base),
      interval(14, base),
    ];

    const result = evaluateTrackingIntegrityRule({ intervals, fresh: true });
    expect(result.result).toBe("triggered");
  });
});
