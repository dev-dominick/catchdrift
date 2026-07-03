import { attributionRatePct, clickToSessionLossPct, toHourly } from "@/domain/calculations";
import { calculateExposureRange } from "@/domain/exposure";
import { DEGRADED, HEALTHY } from "@/demo/scenario";

export function getDeterministicDemoExposureEstimate() {
  const baseline = {
    clickToSessionLossPct: clickToSessionLossPct(HEALTHY.paid_clicks, HEALTHY.sessions),
    attributionRatePct: attributionRatePct(
      HEALTHY.attributed_conversions,
      HEALTHY.internal_submissions,
    ),
    hourlySpend: toHourly(HEALTHY.spend),
    hourlyRevenue: toHourly(HEALTHY.revenue),
  };

  const currentClickLoss = clickToSessionLossPct(DEGRADED.paid_clicks, DEGRADED.sessions);
  const currentAttributionRate = attributionRatePct(
    DEGRADED.attributed_conversions,
    DEGRADED.internal_submissions,
  );

  const current = {
    clickToSessionLossPct: currentClickLoss,
    attributionRatePct: currentAttributionRate,
    hourlySpend: toHourly(DEGRADED.spend),
    hourlyRevenue: toHourly(DEGRADED.revenue),
    clickLossIncreasePoints: currentClickLoss - baseline.clickToSessionLossPct,
    attributionDeclinePercent:
      baseline.attributionRatePct > 0
        ? ((baseline.attributionRatePct - currentAttributionRate) / baseline.attributionRatePct) * 100
        : 0,
  };

  const exposure = calculateExposureRange(baseline, current);

  return {
    hourlySpend: baseline.hourlySpend,
    low: exposure.low,
    high: exposure.high,
  };
}
