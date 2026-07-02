export const METRICS = [
  "spend",
  "paid_clicks",
  "sessions",
  "internal_submissions",
  "attributed_conversions",
  "revenue",
] as const;

export type MetricName = (typeof METRICS)[number];

export type IntervalAggregate = {
  intervalStart: Date;
  intervalEnd: Date;
  spend: number;
  paidClicks: number;
  sessions: number;
  internalSubmissions: number;
  attributedConversions: number;
  revenue: number;
};

export type Baseline = {
  clickToSessionLossPct: number;
  attributionRatePct: number;
  hourlySpend: number;
  hourlyRevenue: number;
};

export type DegradationSignals = {
  clickToSessionLossPct: number;
  attributionRatePct: number;
  hourlySpend: number;
  hourlyRevenue: number;
  clickLossIncreasePoints: number;
  attributionDeclinePercent: number;
};

export type ExposureResult = {
  hourlySpend: number;
  affectedFractionLow: number;
  affectedFractionHigh: number;
  revenueRateDeficit: number;
  low: number;
  high: number;
  calculationVersion: string;
};

export type CorrelationScore = {
  total: number;
  band: "strong" | "plausible" | "weak";
  components: {
    campaignMapped: number;
    trackingSensitiveChanged: number;
    temporalProximity: number;
    healthyBeforeDeployment: number;
    noCompetingDeployment: number;
  };
};

export type RuleEvaluationOutput = {
  result: "suppressed" | "normal" | "triggered";
  suppressionReason?: string;
  baseline?: Baseline;
  current?: DegradationSignals;
  degradedStreakCount?: number;
  eligible?: boolean;
};
