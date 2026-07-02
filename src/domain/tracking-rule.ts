import {
  HEALTHY_BASELINE_INTERVAL_COUNT,
  REQUIRED_DEGRADED_STREAK,
} from "@/lib/constants";
import { attributionRatePct, buildBaseline, clickToSessionLossPct, toHourly } from "@/domain/calculations";
import type { Baseline, DegradationSignals, IntervalAggregate, RuleEvaluationOutput } from "@/domain/types";

export type RuleInput = {
  intervals: IntervalAggregate[];
  fresh: boolean;
  staleReason?: string;
};

const MIN_CLICK_LOSS_INCREASE_POINTS = 8;
const MIN_ATTRIBUTION_DECLINE_PERCENT = 12;
const MIN_HOURLY_SPEND = 300;

function buildSignals(interval: IntervalAggregate, baseline: Baseline): DegradationSignals {
  const clickLoss = clickToSessionLossPct(interval.paidClicks, interval.sessions);
  const attributionRate = attributionRatePct(
    interval.attributedConversions,
    interval.internalSubmissions,
  );
  const hourlySpend = toHourly(interval.spend);
  const hourlyRevenue = toHourly(interval.revenue);

  const clickLossIncreasePoints = clickLoss - baseline.clickToSessionLossPct;
  const attributionDeclinePercent =
    baseline.attributionRatePct > 0
      ? ((baseline.attributionRatePct - attributionRate) / baseline.attributionRatePct) * 100
      : 0;

  return {
    clickToSessionLossPct: clickLoss,
    attributionRatePct: attributionRate,
    hourlySpend,
    hourlyRevenue,
    clickLossIncreasePoints,
    attributionDeclinePercent,
  };
}

export function evaluateTrackingIntegrityRule(input: RuleInput): RuleEvaluationOutput {
  if (!input.fresh) {
    return {
      result: "suppressed",
      suppressionReason: input.staleReason ?? "required_source_stale",
    };
  }

  if (input.intervals.length < HEALTHY_BASELINE_INTERVAL_COUNT + REQUIRED_DEGRADED_STREAK) {
    return {
      result: "normal",
      suppressionReason: "insufficient_mature_intervals",
    };
  }

  const currentIntervals = input.intervals.slice(-REQUIRED_DEGRADED_STREAK);
  const baselineIntervals = input.intervals.slice(
    -(REQUIRED_DEGRADED_STREAK + HEALTHY_BASELINE_INTERVAL_COUNT),
    -REQUIRED_DEGRADED_STREAK,
  );

  const baseline = buildBaseline(baselineIntervals);

  const degradedCount = currentIntervals.reduce((count, interval) => {
    const current = buildSignals(interval, baseline);

    const clickLossBreached = current.clickLossIncreasePoints >= MIN_CLICK_LOSS_INCREASE_POINTS;
    const attributionBreached =
      current.attributionDeclinePercent >= MIN_ATTRIBUTION_DECLINE_PERCENT;
    const spendBreached = current.hourlySpend >= MIN_HOURLY_SPEND;

    return clickLossBreached && attributionBreached && spendBreached ? count + 1 : count;
  }, 0);

  const current = buildSignals(currentIntervals[currentIntervals.length - 1], baseline);

  if (degradedCount < REQUIRED_DEGRADED_STREAK) {
    return {
      result: "normal",
      baseline,
      current,
      degradedStreakCount: degradedCount,
      eligible: false,
    };
  }

  return {
    result: "triggered",
    baseline,
    current,
    degradedStreakCount: degradedCount,
    eligible: true,
  };
}
