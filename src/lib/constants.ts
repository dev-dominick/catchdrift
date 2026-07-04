export const APP_NAME = "CatchDrift";

export const DEMO_WORKSPACE_SLUG = "catchdrift-demo";
export const DEMO_WORKSPACE_NAME = "CatchDrift Demo Workspace";
export const DEMO_CAMPAIGN_NAME = "Meta / Auto Insurance / Campaign 211";
export const DEMO_EXTERNAL_CAMPAIGN_ID = "meta-auto-211";
export const DEMO_TIMEZONE = "America/New_York";
export const DEMO_CURRENCY = "USD";

export const RULE_ID = "tracking_integrity_failure";
export const RULE_VERSION = 1;

export const INTERVAL_MINUTES = 5;
export const HEALTHY_BASELINE_INTERVAL_COUNT = 12;
export const REQUIRED_DEGRADED_STREAK = 3;

export const TRACKING_SENSITIVE_TERMS = [
  "redirecturl",
  "destinationurl",
  "clickid",
  "tracking",
  "pixel",
  "formendpoint",
  "affiliatesubid",
] as const;

export const REQUIRED_SOURCES = [
  "spend_feed",
  "ads_clicks",
  "landing_telemetry",
  "internal_forms",
  "attribution",
  "revenue",
] as const;

export const SOURCE_EXPECTED_DELAYS_MINUTES: Record<string, number> = {
  spend_feed: 5,
  ads_clicks: 5,
  landing_telemetry: 2,
  internal_forms: 5,
  attribution: 5,
  revenue: 20,
  deployment_feed: 60,
};

export const ACTIVE_INCIDENT_STATUSES = [
  "detected",
  "acknowledged",
  "investigating",
] as const;

export const RECOVERABLE_INCIDENT_STATUSES = [
  "detected",
  "acknowledged",
  "investigating",
] as const;

export const DEMO_STORY = {
  spendPerHourMinor: 90000,
  detectionMinutes: 14,
  exposureDuringDetectionMinor: 64000,
  delayedDiscoveryExposureMinor: 384000,
  potentialDailyExposureMinor: 384000,
  campaignsMonitored: 1,
  conversionDeclinePercent: 82,
  attributionDeclinePercent: 25,
  deploymentId: "v42",
  correctiveDeploymentId: "v43",
  recoveryMinutes: 15,
  incidentCause: "Landing-page redirect removed click_id forwarding in deployment v42.",
  incidentCauseShort: "Deployment v42 removed click_id forwarding.",
} as const;
