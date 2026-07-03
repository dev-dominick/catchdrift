import { differenceInMinutes } from "date-fns";
import { notFound } from "next/navigation";
import { BuyerBrief } from "@/components/buyer-brief";
import { EvidenceTimeline } from "@/components/evidence-timeline";
import { IncidentActions } from "@/components/incident-actions";
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

function asHourly(valuePerFiveMinutes: number): number {
  return valuePerFiveMinutes * 12;
}

function comparisonLabel(change: number, tolerance: number) {
  if (Math.abs(change) <= tolerance) {
    return "Stable";
  }

  if (change > 0) {
    return `Up ${formatNumber(change)}`;
  }

  return `Down ${formatNumber(Math.abs(change))}`;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value);
}

function sourceFreshnessLabel(sourceHealth: Array<{ freshness_state: string; source: string }>) {
  const stale = sourceHealth.filter((row) => String(row.freshness_state) !== "healthy");
  if (stale.length === 0) {
    return "All required sources fresh";
  }

  return `Stale sources: ${stale.map((row) => String(row.source)).join(", ")}`;
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

  const baselineSpendHourly = asHourly(toNumber(baselineRow.spend));
  const degradedSpendHourly = asHourly(toNumber(degradedRow.spend));
  const baselineRevenueHourly = asHourly(toNumber(baselineRow.revenue));
  const degradedRevenueHourly = asHourly(toNumber(degradedRow.revenue));

  const baselineClicks = toNumber(baselineRow.paid_clicks);
  const degradedClicks = toNumber(degradedRow.paid_clicks);
  const baselineSessions = toNumber(baselineRow.sessions);
  const degradedSessions = toNumber(degradedRow.sessions);
  const baselineInternal = toNumber(baselineRow.internal_submissions);
  const degradedInternal = toNumber(degradedRow.internal_submissions);
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
  const attributedDecline = metric.current.attributionDeclinePercent;
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

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Incident detail</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">
          Tracking integrity degraded while {formatMoney(baseline.hourlySpend)}/hour remained active.
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-700">{summary}</p>
        <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          Estimated financial exposure - not confirmed realized loss.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Info label="Spend still active" value={`${formatMoney(baseline.hourlySpend)}/hour`} />
          <Info
            label="Estimated exposure"
            value={exposureLabel(
              incident.exposure_low_minor == null ? null : Number(incident.exposure_low_minor),
              incident.exposure_high_minor == null ? null : Number(incident.exposure_high_minor),
              String(incident.currency),
            )}
          />
          <Info label="Attribution decline" value={formatPercent(attributedDecline)} />
          <Info
            label="Strongest correlated change"
            value={deploymentCandidate?.version ?? "No candidate in evidence"}
          />
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Info label="Campaign" value={String(incident.campaign_name)} />
          <Info label="Incident state" value={String(incident.status)} />
          <Info label="Severity" value={String(incident.severity)} />
          <Info label="Confidence" value={String(incident.confidence)} />
          <Info label="Revenue-rate deficit" value={`${formatMoney(baselineRevenueHourly - degradedRevenueHourly)}/hour`} />
          <Info label="First detected" value={detectedAt.toLocaleString()} />
          <Info label="Source freshness" value={sourceFreshnessLabel(sourceHealth as never[])} />
          <Info label="Rule" value={`${String(incident.rule_id)}@${String(incident.rule_version)}`} />
        </div>

        <div className="mt-4">
          <IncidentActions incidentId={incidentId} />
        </div>
      </header>

      <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Healthy vs degraded comparison</h2>
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Metric</th>
                <th className="px-4 py-3">Healthy baseline</th>
                <th className="px-4 py-3">Degraded</th>
                <th className="px-4 py-3">Change</th>
              </tr>
            </thead>
            <tbody>
              <ComparisonRow
                metric="Hourly spend"
                baseline={`${formatMoney(baselineSpendHourly)}`}
                degraded={`${formatMoney(degradedSpendHourly)}`}
                change={comparisonLabel(degradedSpendHourly - baselineSpendHourly, 1)}
              />
              <ComparisonRow
                metric="Paid clicks"
                baseline={`${baselineClicks}`}
                degraded={`${degradedClicks}`}
                change={comparisonLabel(degradedClicks - baselineClicks, 2)}
              />
              <ComparisonRow
                metric="Sessions"
                baseline={`${baselineSessions}`}
                degraded={`${degradedSessions}`}
                change={comparisonLabel(degradedSessions - baselineSessions, 2)}
              />
              <ComparisonRow
                metric="Internal submissions"
                baseline={`${baselineInternal}`}
                degraded={`${degradedInternal}`}
                change={comparisonLabel(degradedInternal - baselineInternal, 1)}
              />
              <ComparisonRow
                metric="Attributed conversions"
                baseline={`${baselineAttributed}`}
                degraded={`${degradedAttributed}`}
                change={comparisonLabel(degradedAttributed - baselineAttributed, 1)}
              />
              <ComparisonRow
                metric="Hourly revenue"
                baseline={`${formatMoney(baselineRevenueHourly)}`}
                degraded={`${formatMoney(degradedRevenueHourly)}`}
                change={`Down ${formatMoney(baselineRevenueHourly - degradedRevenueHourly)}/hour`}
              />
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Financial impact framing</h2>
        <ul className="mt-3 space-y-2 text-sm text-slate-700">
          <li>
            Current exposure rate: {exposureLabel(
              incident.exposure_low_minor == null ? null : Number(incident.exposure_low_minor),
              incident.exposure_high_minor == null ? null : Number(incident.exposure_high_minor),
              String(incident.currency),
            )}
          </li>
          <li>Observed incident duration: {(incidentDurationHours * 60).toFixed(1)} minutes</li>
          <li>
            Cumulative observed exposure during this incident: {cumulativeLow == null || cumulativeHigh == null
              ? "n/a"
              : `${formatMoney(cumulativeLow)}-${formatMoney(cumulativeHigh)}`}
          </li>
          <li>
            Assuming manual discovery 90 minutes later, potential additional exposure surfaced earlier:
            {" "}
            {potentialAdditionalLow == null || potentialAdditionalHigh == null
              ? "n/a"
              : `${formatMoney(potentialAdditionalLow)}-${formatMoney(potentialAdditionalHigh)}`}
          </li>
        </ul>
        <p className="mt-3 text-xs text-slate-600">
          Potential additional exposure is a demo assumption, not confirmed savings.
        </p>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Why CatchDrift fired this incident</h2>
          <ul className="mt-3 space-y-2 text-sm text-slate-700">
            <li>
              Click-loss increase: observed {formatPercent(metric.current.clickLossIncreasePoints)} vs threshold {formatPercent(threshold.clickLossIncreasePoints)}.
            </li>
            <li>
              Attribution decline: observed {formatPercent(metric.current.attributionDeclinePercent)} vs threshold {formatPercent(threshold.attributionDeclinePercent)}.
            </li>
            <li>Persistence requirement: {threshold.persistenceIntervals} degraded mature intervals.</li>
            <li>Observed degraded intervals: {metric.degradedStreakCount}.</li>
            <li>Hourly spend gate: observed {formatMoney(metric.current.hourlySpend)} vs minimum {formatMoney(300)}.</li>
            <li>Freshness result: {sourceFreshnessLabel(sourceHealth as never[])}.</li>
          </ul>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Deployment correlation</h2>
          <p className="mt-2 rounded-md border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
            Strongest correlated change - not confirmed causation.
          </p>
          <ul className="mt-3 space-y-2 text-sm text-slate-700">
            <li>Deployment ID: {deploymentCandidate?.external_deployment_id ?? "n/a"}</li>
            <li>Deployment version: {deploymentCandidate?.version ?? "n/a"}</li>
            <li>
              Deployment timestamp: {deploymentCandidate ? new Date(deploymentCandidate.deployed_at).toLocaleString() : "n/a"}
            </li>
            <li>Affected component: {affectedComponent}</li>
            <li>
              Time between deployment and degradation: {deploymentGapMinutes == null ? "n/a" : `${deploymentGapMinutes} minutes`}
            </li>
            <li>Correlation score: {deploymentScore ? `${deploymentScore.total} (${deploymentScore.band})` : "n/a"}</li>
            <li>Confidence band: {deploymentScore?.band ?? "n/a"}</li>
            <li>
              Reasons: {deploymentScore ? describeCorrelationReasons(deploymentScore.components) : "No score evidence."}
            </li>
          </ul>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Deterministic investigation checklist</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-700">
            <li>Verify click-ID forwarding in redirect responses.</li>
            <li>Compare redirect behavior before and after deployment v42.</li>
            <li>Inspect attribution payloads for missing campaign identifiers.</li>
            <li>Confirm internal submissions still contain click and campaign identifiers.</li>
            <li>Validate attributed conversions against internal submissions.</li>
            <li>Roll back or correct the deployment only if evidence confirms the issue.</li>
            <li>Observe required recovery intervals before resolving.</li>
          </ol>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Recovery status</h2>
          <ul className="mt-3 space-y-2 text-sm text-slate-700">
            <li>Corrective deployment: {String(latestCorrectiveDeployment?.version ?? "n/a")}</li>
            <li>Recovery start: {incident.recovered_at ? new Date(String(incident.recovered_at)).toLocaleString() : "Not yet recovered"}</li>
            <li>Recovery interval count: {recoveredCount}</li>
            <li>Restored attributed conversions: {rows.length ? rows[rows.length - 1]?.attributed_conversions : "n/a"}</li>
            <li>
              Restored revenue rate: {rows.length ? `${formatMoney(asHourly(toNumber(rows[rows.length - 1]?.revenue ?? "0")))}/hour` : "n/a"}
            </li>
            <li>
              Recovered means metrics returned to expected ranges. Resolved means an operator completed the incident workflow.
            </li>
          </ul>
        </section>

        <BuyerBrief incidentId={incidentId} />

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
