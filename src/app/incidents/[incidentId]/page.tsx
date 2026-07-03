import { differenceInMinutes } from "date-fns";
import { notFound } from "next/navigation";
import { BuyerBrief } from "@/components/buyer-brief";
import { EvidenceTimeline } from "@/components/evidence-timeline";
import { IncidentActions } from "@/components/incident-actions";
import { IncidentLiveRefresh } from "@/components/incident-live-refresh";
import { getIncident } from "@/domain/engine";
import { exposureLabel, formatMoney, formatPercent } from "@/lib/format";

export const dynamic = "force-dynamic";

type Params = {
  incidentId: string;
};

type TimelineRow = {
  interval_start: string;
  interval_end: string;
  spend: string;
  paid_clicks: string;
  sessions: string;
  internal_submissions: string;
  attributed_conversions: string;
  revenue: string;
};

type BaselineEvidence = {
  hourlySpend: number;
  hourlyRevenue: number;
  attributionRatePct: number;
  clickToSessionLossPct: number;
};

type MetricEvidence = {
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

type ThresholdEvidence = {
  clickLossIncreasePoints: number;
  attributionDeclinePercent: number;
  persistenceIntervals: number;
};

type DeploymentEvidence = {
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

function pickEvidence<T>(
  evidence: Array<{ evidence_type: string; evidence_json: unknown }>,
  type: string,
): T | null {
  const found = evidence.find((item) => String(item.evidence_type) === type);
  return (found?.evidence_json as T) ?? null;
}

function parseTimelineRows(rows: unknown[]): TimelineRow[] {
  return rows as TimelineRow[];
}

function toNumber(value: string): number {
  return Number(value);
}

function sourceFreshnessLabel(
  sourceHealth: Array<{
    derived_freshness_state?: string;
    freshness_label?: string;
    overdue_minutes?: number | null;
    source: string;
  }>,
) {
  const stale = sourceHealth.filter((row) => {
    const state = String(row.derived_freshness_state ?? "stale");
    return state === "stale" || state === "connector_unavailable";
  });
  if (stale.length === 0) {
    return "All required sources fresh";
  }

  return `Decision suppression active: ${stale
    .map((row) => {
      const overdue = typeof row.overdue_minutes === "number" && row.overdue_minutes > 0
        ? ` (${row.overdue_minutes}m overdue)`
        : "";
      return `${String(row.source)} ${String(row.freshness_label ?? "stale")}${overdue}`;
    })
    .join(", ")}`;
}

function recoveryIntervalsCount(rows: TimelineRow[], baseline: BaselineEvidence): number {
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

export default async function IncidentDetailPage({ params }: { params: Promise<Params> }) {
  const { incidentId } = await params;
  const data = await getIncident(incidentId);

  if (!data) {
    notFound();
  }

  const { incident, evidence, events, timeline, sourceHealth, deployments } = data;
  const baseline = pickEvidence<BaselineEvidence>(evidence as never[], "baseline");
  const threshold = pickEvidence<ThresholdEvidence>(evidence as never[], "threshold");
  const metric = pickEvidence<MetricEvidence>(evidence as never[], "metric");
  const deployment = pickEvidence<DeploymentEvidence>(evidence as never[], "deployment");

  if (!baseline || !threshold || !metric) {
    notFound();
  }

  const rows = parseTimelineRows(timeline as unknown[]);
  const degradedWindowStart = new Date(metric.evaluationWindowStart);
  const degradedWindowEnd = new Date(metric.evaluationWindowEnd);

  const baselineRow =
    [...rows]
      .reverse()
      .find((row) => new Date(row.interval_end).getTime() <= degradedWindowStart.getTime()) ?? rows[0];

  const degradedCandidates = rows.filter((row) => {
    const end = new Date(row.interval_end).getTime();
    return end <= degradedWindowEnd.getTime() && end >= degradedWindowStart.getTime();
  });
  const degradedRow = degradedCandidates[degradedCandidates.length - 1] ?? rows[rows.length - 1];

  const baselineAttributed = toNumber(baselineRow.attributed_conversions);
  const degradedAttributed = toNumber(degradedRow.attributed_conversions);

  const deploymentCandidate = deployment?.candidate ?? null;
  const deploymentScore = deployment?.score ?? null;
  const affectedComponent = deploymentCandidate?.changes_json?.[0]?.path ?? "n/a";
  const deploymentGapMinutes = deploymentCandidate
    ? Math.abs(differenceInMinutes(degradedWindowStart, new Date(deploymentCandidate.deployed_at)))
    : null;

  const detectedAt = new Date(String(incident.detected_at));
  const durationEnd = incident.recovered_at
    ? new Date(String(incident.recovered_at))
    : incident.resolved_at
      ? new Date(String(incident.resolved_at))
      : new Date();
  const incidentDurationHours = Math.max(0, (durationEnd.getTime() - detectedAt.getTime()) / 3_600_000);
  const exposureLowHourly = incident.exposure_low_minor == null ? null : Number(incident.exposure_low_minor) / 100;
  const exposureHighHourly = incident.exposure_high_minor == null ? null : Number(incident.exposure_high_minor) / 100;
  const cumulativeLow = exposureLowHourly == null ? null : exposureLowHourly * incidentDurationHours;
  const cumulativeHigh = exposureHighHourly == null ? null : exposureHighHourly * incidentDurationHours;
  const potentialAdditionalLow = exposureLowHourly == null ? null : exposureLowHourly * 1.5;
  const potentialAdditionalHigh = exposureHighHourly == null ? null : exposureHighHourly * 1.5;
  const recoveredCount = recoveryIntervalsCount(rows, baseline);

  const latestCorrectiveDeployment = (deployments as Array<Record<string, unknown>>).find(
    (item) => String(item.version) !== String(deploymentCandidate?.version),
  );

  const summary = `Tracking integrity degraded while ${formatMoney(
    baseline.hourlySpend,
  )}/hour remained active. Attributed conversions fell from ${baselineAttributed} to ${degradedAttributed} while internal submissions remained near baseline. ${
    deploymentCandidate ? `Deployment ${deploymentCandidate.version}` : "A recent deployment"
  } is the strongest correlated change. Estimated financial exposure: ${exposureLabel(
    incident.exposure_low_minor == null ? null : Number(incident.exposure_low_minor),
    incident.exposure_high_minor == null ? null : Number(incident.exposure_high_minor),
    String(incident.currency),
  )}.`;

  const activeFreshnessSuppression = sourceFreshnessLabel(sourceHealth as never[]);
  const recommendedAction = "Validate redirect tracking and attribution payload integrity before rollback.";
  const recoveryStatus = incident.recovered_at ? "Recovery verified" : "Recovery still in progress";

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <IncidentLiveRefresh status={String(incident.status)} />
      <header className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Incident detail</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">What happened?</h1>
        <p className="mt-3 text-sm leading-6 text-slate-700">{summary}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Info label="Affected campaign" value={String(incident.campaign_name)} />
          <Info label="Channel" value="Paid social (demo replay)" />
          <Info label="Active spend" value={`${formatMoney(baseline.hourlySpend)}/hour`} />
          <Info label="Detected failure" value="Tracking integrity degradation" />
          <Info label="Likely correlated change" value={`Deployment ${deploymentCandidate?.version ?? "n/a"}`} />
          <Info label="Recommended next action" value={recommendedAction} />
          <Info label="Recovery status" value={recoveryStatus} />
          <Info label="Current state" value={String(incident.status)} />
          <Info label="Estimated exposure/hour" value={exposureLabel(
            incident.exposure_low_minor == null ? null : Number(incident.exposure_low_minor),
            incident.exposure_high_minor == null ? null : Number(incident.exposure_high_minor),
            String(incident.currency),
          )} />
        </div>

        <p className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
          Deterministic detection. AI-assisted investigation. Human-controlled action.
        </p>

        <p className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
          Correlation evidence highlights the strongest likely operational change, but does not
          prove causation.
        </p>

        <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          Financial numbers are estimated exposure signals, not confirmed money saved.
        </p>

        <div className="mt-4">
          <IncidentActions incidentId={incidentId} />
        </div>
      </header>

      <BuyerBrief incidentId={incidentId} />

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Why CatchDrift opened this incident</h2>
          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Condition</th>
                  <th className="px-4 py-3">Observed</th>
                  <th className="px-4 py-3">Threshold</th>
                  <th className="px-4 py-3">State</th>
                </tr>
              </thead>
              <tbody>
                <ComparisonRow
                  metric="Spend active"
                  baseline={`${formatMoney(metric.current.hourlySpend)}/hour`}
                  degraded={`${formatMoney(300)}/hour minimum`}
                  change={metric.current.hourlySpend >= 300 ? "Pass" : "Fail"}
                />
                <ComparisonRow
                  metric="Click-to-session degradation"
                  baseline={formatPercent(metric.current.clickLossIncreasePoints)}
                  degraded={formatPercent(threshold.clickLossIncreasePoints)}
                  change={metric.current.clickLossIncreasePoints >= threshold.clickLossIncreasePoints ? "Pass" : "Fail"}
                />
                <ComparisonRow
                  metric="Attribution degradation"
                  baseline={formatPercent(metric.current.attributionDeclinePercent)}
                  degraded={formatPercent(threshold.attributionDeclinePercent)}
                  change={metric.current.attributionDeclinePercent >= threshold.attributionDeclinePercent ? "Pass" : "Fail"}
                />
                <ComparisonRow
                  metric="Persistence requirement"
                  baseline={`${metric.degradedStreakCount} intervals`}
                  degraded={`${threshold.persistenceIntervals} intervals`}
                  change={metric.degradedStreakCount >= threshold.persistenceIntervals ? "Pass" : "Fail"}
                />
                <ComparisonRow
                  metric="Required source freshness"
                  baseline={activeFreshnessSuppression}
                  degraded="all required sources decision-ready"
                  change={activeFreshnessSuppression.startsWith("All") ? "Pass" : "Suppressed"}
                />
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Correlated operational change</h2>
          <p className="mt-2 rounded-md border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
            Strongest correlated change - not confirmed causation.
          </p>
          <ul className="mt-3 space-y-2 text-sm text-slate-700">
            <li>Deployment version: {deploymentCandidate?.version ?? "n/a"}</li>
            <li>
              Deployment timestamp: {deploymentCandidate ? new Date(deploymentCandidate.deployed_at).toLocaleString() : "n/a"}
            </li>
            <li>Changed field: {affectedComponent}</li>
            <li>
              Previous value: {deploymentCandidate?.changes_json?.[0]?.previousValue ?? "n/a"}
            </li>
            <li>
              New value: {deploymentCandidate?.changes_json?.[0]?.nextValue ?? "n/a"}
            </li>
            <li>
              Correlation score: {deploymentScore ? `${deploymentScore.total} (${deploymentScore.band})` : "n/a"}
            </li>
            <li>
              Reasons: {deploymentScore ? describeCorrelationReasons(deploymentScore.components) : "No score evidence."}
            </li>
            <li>
              Time from change to degradation: {deploymentGapMinutes == null ? "n/a" : `${deploymentGapMinutes} minutes`}
            </li>
          </ul>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Recommended investigation steps</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-700">
            <li>Verify click-ID forwarding in redirect responses.</li>
            <li>
              Compare redirect behavior before and after deployment {deploymentCandidate?.version ?? "shown in the correlated change section"}.
            </li>
            <li>Inspect attribution payloads for missing campaign identifiers.</li>
            <li>Confirm internal submissions still contain click and campaign identifiers.</li>
            <li>Validate attributed conversions against internal submissions.</li>
            <li>Roll back or correct the deployment only if evidence confirms the issue.</li>
            <li>Observe required recovery intervals before resolving.</li>
          </ol>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Financial exposure</h2>
          <ul className="mt-3 space-y-2 text-sm text-slate-700">
            <li>
              Exposure-rate range: {exposureLabel(
                incident.exposure_low_minor == null ? null : Number(incident.exposure_low_minor),
                incident.exposure_high_minor == null ? null : Number(incident.exposure_high_minor),
                String(incident.currency),
              )}
            </li>
            <li>Incident duration: {(incidentDurationHours * 60).toFixed(1)} minutes</li>
            <li>
              Accumulated estimated exposure: {cumulativeLow == null || cumulativeHigh == null
                ? "n/a"
                : `${formatMoney(cumulativeLow)}-${formatMoney(cumulativeHigh)}`}
            </li>
            <li>
              Calculation assumptions: baseline vs degraded attribution and click-loss drift on active spend.
            </li>
            <li>
              90-minute delayed manual discovery estimate: {potentialAdditionalLow == null || potentialAdditionalHigh == null
                ? "n/a"
                : `${formatMoney(potentialAdditionalLow)}-${formatMoney(potentialAdditionalHigh)}`}
            </li>
          </ul>
          <p className="mt-3 text-xs text-slate-600">
            Explicit disclaimer: this is estimated exposure, not confirmed money saved.
          </p>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Recovery verification</h2>
          <ul className="mt-3 space-y-2 text-sm text-slate-700">
            <li>Corrective deployment: {String(latestCorrectiveDeployment?.version ?? "n/a")}</li>
            <li>Required recovery intervals: 3</li>
            <li>Completed recovery intervals: {recoveredCount}</li>
            <li>Restored attributed conversions: {rows.length ? rows[rows.length - 1]?.attributed_conversions : "n/a"}</li>
            <li>
              Restored ratios: click-loss near baseline and attribution within recovery threshold.
            </li>
            <li>Recovery timestamp: {incident.recovered_at ? new Date(String(incident.recovered_at)).toLocaleString() : "Not yet recovered"}</li>
            <li>Final status: {String(incident.status)}</li>
            <li>
              Recovered means metrics returned to expected ranges. Resolved means an operator completed the incident workflow.
            </li>
          </ul>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
          <h2 className="text-lg font-semibold text-slate-900">Evidence timeline</h2>
          <p className="mt-1 text-sm text-slate-600">
            Baseline and degraded intervals are displayed with spend, revenue, click loss, and attribution rate.
          </p>
          <div className="mt-4">
            <EvidenceTimeline rows={timeline as never[]} />
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
          <h2 className="text-lg font-semibold text-slate-900">Source evidence</h2>
          <p className="mt-1 text-sm text-slate-600">Structured persisted evidence used for deterministic evaluation.</p>
          <pre className="mt-3 overflow-x-auto rounded bg-slate-950 p-3 text-xs text-slate-100">
            {JSON.stringify({ evidence, events }, null, 2)}
          </pre>
        </section>
      </div>
    </div>
  );
}

function describeCorrelationReasons(components: {
  campaignMapped: number;
  trackingSensitiveChanged: number;
  temporalProximity: number;
  healthyBeforeDeployment: number;
  noCompetingDeployment: number;
}) {
  const reasons: string[] = [];

  if (components.campaignMapped > 0) {
    reasons.push("campaign mapping present");
  }
  if (components.trackingSensitiveChanged > 0) {
    reasons.push("tracking-sensitive field changed");
  }
  if (components.temporalProximity > 0) {
    reasons.push("timing within 30 minutes");
  }
  if (components.healthyBeforeDeployment > 0) {
    reasons.push("campaign healthy before change");
  }
  if (components.noCompetingDeployment > 0) {
    reasons.push("no competing nearby deployment");
  }

  return reasons.join(", ");
}

function ComparisonRow({
  metric,
  baseline,
  degraded,
  change,
}: {
  metric: string;
  baseline: string;
  degraded: string;
  change: string;
}) {
  return (
    <tr className="border-t border-slate-100">
      <td className="px-4 py-3 font-medium text-slate-900">{metric}</td>
      <td className="px-4 py-3 text-slate-700">{baseline}</td>
      <td className="px-4 py-3 text-slate-700">{degraded}</td>
      <td className="px-4 py-3 text-slate-900">{change}</td>
    </tr>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}
