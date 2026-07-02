import Decimal from "decimal.js";
import type { Baseline, DegradationSignals, ExposureResult } from "@/domain/types";

export const EXPOSURE_CALCULATION_VERSION = "exposure_v1";

export function calculateExposureRange(
  baseline: Baseline,
  current: DegradationSignals,
): ExposureResult {
  const hourlySpend = new Decimal(current.hourlySpend);
  const excessClickLoss = new Decimal(Math.max(0, current.clickLossIncreasePoints)).div(100);
  const excessAttributionLoss = new Decimal(
    Math.max(0, baseline.attributionRatePct - current.attributionRatePct),
  ).div(100);

  const affectedFractionLow = Decimal.min(
    1,
    excessClickLoss.plus(excessAttributionLoss.mul(0.56)),
  );
  const affectedFractionHigh = Decimal.min(1, excessClickLoss.plus(excessAttributionLoss));

  const revenueRateDeficit = new Decimal(Math.max(0, baseline.hourlyRevenue - current.hourlyRevenue));

  const spendBasedLow = hourlySpend.mul(affectedFractionLow);
  const spendBasedHigh = hourlySpend.mul(affectedFractionHigh);

  const low = Decimal.min(spendBasedLow, revenueRateDeficit);
  const high = Decimal.min(spendBasedHigh, revenueRateDeficit);

  return {
    hourlySpend: hourlySpend.toNumber(),
    affectedFractionLow: affectedFractionLow.toNumber(),
    affectedFractionHigh: affectedFractionHigh.toNumber(),
    revenueRateDeficit: revenueRateDeficit.toNumber(),
    low: low.toDecimalPlaces(2).toNumber(),
    high: high.toDecimalPlaces(2).toNumber(),
    calculationVersion: EXPOSURE_CALCULATION_VERSION,
  };
}

export function dollarsToMinorUnits(value: number): number {
  return new Decimal(value).mul(100).toNearest(1).toNumber();
}
