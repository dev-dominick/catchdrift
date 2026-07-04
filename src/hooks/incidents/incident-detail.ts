export type TimelineRow = {
  interval_start: string;
  interval_end: string;
  spend: string;
  paid_clicks: string;
  sessions: string;
  internal_submissions: string;
  attributed_conversions: string;
  revenue: string;
};

export type BaselineEvidence = {
  hourlySpend: number;
  hourlyRevenue: number;
  attributionRatePct: number;
  clickToSessionLossPct: number;
};

export type MetricEvidence = {
  current: {
    hourlySpend: number;
    hourlyRevenue: number;
    attributionRatePct: number;
    clickToSessionLossPct: number;
    clickLossIncreasePoints: number;
    attributionDeclinePercent: number;
  };
  degradedStreakCount: number;
  evaluationWindowStart: string;
  evaluationWindowEnd: string;
};

export type ThresholdEvidence = {
  clickLossIncreasePoints: number;
  attributionDeclinePercent: number;
  persistenceIntervals: number;
};

export type DeploymentEvidence = {
  candidate: {
    id: string;
    source: string;
    version: string;
    deployed_at: string;
    external_deployment_id: string;
    changes_json: Array<{ path: string; previousValue: string; nextValue: string }>;
  };
  score: {
    total: number;
    band: string;
    components: {
      campaignMapped: number;
      trackingSensitiveChanged: number;
      temporalProximity: number;
      healthyBeforeDeployment: number;
      noCompetingDeployment: number;
    };
  };
};

type SourceHealthRow = {
  derived_freshness_state?: string;
  freshness_label?: string;
  overdue_minutes?: number | null;
  source: string;
};

type TimelineMarker = {
  timestamp: string;
  label: string;
};

type IncidentTimelineInputs = {
  rows: TimelineRow[];
  evaluationWindowStart: string;
  detectedAt: string;
};

function toNumber(value: string): number {
  return Number(value);
}

export function pickEvidence<T>(
  evidence: Array<{ evidence_type: string; evidence_json: unknown }>,
  type: string,
): T | null {
  const found = evidence.find((item) => String(item.evidence_type) === type);
  return (found?.evidence_json as T) ?? null;
}

export function parseTimelineRows(rows: unknown[]): TimelineRow[] {
  return rows as TimelineRow[];
}

export function sourceFreshnessLabel(sourceHealth: SourceHealthRow[]) {
  const stale = sourceHealth.filter((row) => {
    const state = String(row.derived_freshness_state ?? "stale");
    return state === "stale" || state === "connector_unavailable";
  });

  if (stale.length === 0) {
    return "All required sources fresh";
  }

  return `Decision suppression active: ${stale
    .map((row) => {
      const overdue =
        typeof row.overdue_minutes === "number" && row.overdue_minutes > 0
          ? ` (${row.overdue_minutes}m overdue)`
          : "";
      return `${String(row.source)} ${String(row.freshness_label ?? "stale")}${overdue}`;
    })
    .join(", ")}`;
}

export function normalizeIncidentStatus(status: string): string {
  if (status === "recovered") {
    return "Recovered";
  }

  if (status === "resolved") {
    return "Resolved";
  }

  if (status === "investigating") {
    return "Investigating";
  }

  if (status === "acknowledged") {
    return "Acknowledged";
  }

  return "Active";
}

export function recoveryIntervalsCount(rows: TimelineRow[], baseline: BaselineEvidence): number {
  let count = 0;

  for (let idx = rows.length - 1; idx >= 0; idx -= 1) {
    const row = rows[idx];
    const paidClicks = toNumber(row.paid_clicks);
    const sessions = toNumber(row.sessions);
    const submissions = toNumber(row.internal_submissions);
    const attributed = toNumber(row.attributed_conversions);

    if (paidClicks <= 0 || submissions <= 0) {
      break;
    }

    const clickLoss = ((paidClicks - sessions) / paidClicks) * 100;
    const attribution = (attributed / submissions) * 100;
    const clickRecovered = clickLoss <= baseline.clickToSessionLossPct + 4;
    const attrRecovered = attribution >= baseline.attributionRatePct * 0.94;

    if (!clickRecovered || !attrRecovered) {
      break;
    }

    count += 1;
  }

  return count;
}

export function deriveIncidentTimelineRows({
  rows,
  evaluationWindowStart,
  detectedAt,
}: IncidentTimelineInputs): {
  baselineRow: TimelineRow;
  degradedRow: TimelineRow;
} {
  const degradedWindowStart = new Date(evaluationWindowStart);
  const detectedAtDate = new Date(detectedAt);

  const baselineRow =
    [...rows]
      .reverse()
      .find((row) => new Date(row.interval_end).getTime() <= degradedWindowStart.getTime()) ?? rows[0];

  const degradedRows = rows.filter((row) => {
    const rowStart = new Date(row.interval_start).getTime();
    return rowStart >= degradedWindowStart.getTime() && rowStart <= detectedAtDate.getTime();
  });

  const degradedRow =
    degradedRows.reduce<TimelineRow | null>((lowest, row) => {
      if (!lowest) {
        return row;
      }

      return Number(row.attributed_conversions) < Number(lowest.attributed_conversions) ? row : lowest;
    }, null) ?? rows[rows.length - 1];

  return { baselineRow, degradedRow };
}

export function buildTimelineMarkers(params: {
  deployedAt?: string | null;
  detectedAt?: string | null;
  fixedAt?: string | null;
  recoveredAt?: string | null;
}): TimelineMarker[] {
  return [
    params.deployedAt ? { timestamp: params.deployedAt, label: "Deployment" } : null,
    params.detectedAt ? { timestamp: params.detectedAt, label: "Incident detected" } : null,
    params.fixedAt ? { timestamp: params.fixedAt, label: "Fix applied" } : null,
    params.recoveredAt ? { timestamp: params.recoveredAt, label: "Recovery verified" } : null,
  ].filter((value): value is TimelineMarker => value !== null);
}

export function buildIncidentSummaries(params: {
  hourlySpendLabel: string;
  baselineAttributed: number;
  degradedAttributed: number;
  deploymentVersion: string;
  deploymentIdentifier: string;
  detectionDurationMinutes: number;
  exposureAtDetectionLabel: string;
  potentialDailyExposureLabel: string;
}): { executiveSummary: string; summary: string } {
  const deploymentVersion = params.deploymentVersion || params.deploymentIdentifier;

  return {
    summary: `Paid traffic continued at ${params.hourlySpendLabel}/hour, but attributed conversions fell from ${params.baselineAttributed} to ${params.degradedAttributed}. The strongest related change was deployment ${deploymentVersion}, which removed the click ID from the landing-page redirect.`,
    executiveSummary: `CatchDrift identified this failure ${params.detectionDurationMinutes} minutes after deployment ${params.deploymentIdentifier}, with ${params.exposureAtDetectionLabel} exposed before detection and ${params.potentialDailyExposureLabel} in potential daily exposure.`,
  };
}