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

export const DEMO_SCENARIO = {
  incidentTitle: "Tracking failure detected after deployment v42",
  campaignName: DEMO_CAMPAIGN_NAME,
  trafficSource: "Meta",
  spendPerHourMinor: 90000,
  potentialDailyExposureMinor: 384000,
  exposureAtDetectionMinor: 64000,
  attributionDeclinePercent: 25,
  sessionDeclinePercent: 18,
  conversionDeclinePercent: 82,
  detectionDurationMinutes: 14,
  recoveryWindowCount: 3,
  deploymentIdentifier: "v42",
  correctiveDeploymentIdentifier: "v43",
  deploymentExternalId: "deploy-v42",
  correctiveDeploymentExternalId: "deploy-v43",
  rootCauseSummary: "Landing-page redirect removed click_id forwarding in deployment v42.",
  recommendedAction:
    "Verify click_id forwarding in landing-page redirects and confirm attribution payload integrity after deployment v42.",
  finalRecoveryStatement:
    "Revenue leak contained. CatchDrift verified recovery across three consecutive evaluation windows.",
  stagedExposureMinor: {
    healthy: 0,
    degradation: 16000,
    confirmation: 32000,
    detected: 64000,
  },
} as const;

export const DEMO_STORY = {
  spendPerHourMinor: 90000,
  detectionMinutes: DEMO_SCENARIO.detectionDurationMinutes,
  exposureDuringDetectionMinor: DEMO_SCENARIO.exposureAtDetectionMinor,
  delayedDiscoveryExposureMinor: 384000,
  potentialDailyExposureMinor: DEMO_SCENARIO.potentialDailyExposureMinor,
  campaignsMonitored: 1,
  conversionDeclinePercent: DEMO_SCENARIO.conversionDeclinePercent,
  attributionDeclinePercent: DEMO_SCENARIO.attributionDeclinePercent,
  deploymentId: DEMO_SCENARIO.deploymentIdentifier,
  correctiveDeploymentId: DEMO_SCENARIO.correctiveDeploymentIdentifier,
  recoveryMinutes: 15,
  incidentCause: DEMO_SCENARIO.rootCauseSummary,
  incidentCauseShort: "Deployment v42 removed click_id forwarding.",
} as const;
