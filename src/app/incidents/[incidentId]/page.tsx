import { differenceInMinutes } from "date-fns";
import { notFound } from "next/navigation";
import { EvidenceTimeline } from "@/components/evidence-timeline";
import { IncidentActions } from "@/components/incident-actions";
import { IncidentLiveRefresh } from "@/components/incident-live-refresh";
import { getIncident } from "@/domain/engine";
import { DEMO_STORY } from "@/lib/constants";
import { exposureLabel, formatMoney, formatMoneyMinor, formatPercent } from "@/lib/format";

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

function normalizeStatus(status: string): string {
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

  const { incident, evidence, events, timeline, sourceHealth, evaluationFreshness, deployments } = data;
  const baseline = pickEvidence<BaselineEvidence>(evidence as never[], "baseline");
  const threshold = pickEvidence<ThresholdEvidence>(evidence as never[], "threshold");
  const metric = pickEvidence<MetricEvidence>(evidence as never[], "metric");
  const deployment = pickEvidence<DeploymentEvidence>(evidence as never[], "deployment");

  if (!baseline || !threshold || !metric) {
    notFound();
  }

  const rows = parseTimelineRows(timeline as unknown[]);
  const degradedWindowStart = new Date(metric.evaluationWindowStart);
  const detectedAt = new Date(String(incident.detected_at));

  const baselineRow =
    [...rows]
      .reverse()
      .find((row) => new Date(row.interval_end).getTime() <= degradedWindowStart.getTime()) ?? rows[0];

  const degradedRows = rows.filter((row) => {
    const rowStart = new Date(row.interval_start).getTime();
    return rowStart >= degradedWindowStart.getTime() && rowStart <= detectedAt.getTime();
  });
  const degradedRow = degradedRows.reduce<TimelineRow | null>((lowest, row) => {
    if (!lowest) {
      return row;
    }

    return Number(row.attributed_conversions) < Number(lowest.attributed_conversions) ? row : lowest;
  }, null) ?? rows[rows.length - 1];

  const baselineAttributed = toNumber(baselineRow.attributed_conversions);
  const degradedAttributed = toNumber(degradedRow.attributed_conversions);

  const deploymentCandidate = deployment?.candidate ?? null;
  const deploymentScore = deployment?.score ?? null;
  const affectedComponent = deploymentCandidate?.changes_json?.[0]?.path ?? "redirectUrl";
  const deploymentGapMinutes = deploymentCandidate
    ? Math.abs(differenceInMinutes(degradedWindowStart, new Date(deploymentCandidate.deployed_at)))
    : null;

  const exposureLowHourly = incident.exposure_low_minor == null ? null : Number(incident.exposure_low_minor) / 100;
  const exposureHighHourly = incident.exposure_high_minor == null ? null : Number(incident.exposure_high_minor) / 100;
  const potentialAdditionalLow = exposureLowHourly == null ? null : exposureLowHourly * 1.5;
  const potentialAdditionalHigh = exposureHighHourly == null ? null : exposureHighHourly * 1.5;
  const recoveredCount = recoveryIntervalsCount(rows, baseline);

  const latestCorrectiveDeployment = (deployments as Array<Record<string, unknown>>).find(
    (item) => String(item.version) !== String(deploymentCandidate?.version),
  );
  const timelineMarkers = [
    deploymentCandidate?.deployed_at
      ? { timestamp: String(deploymentCandidate.deployed_at), label: "Deployment" }
      : null,
    incident.detected_at
      ? { timestamp: String(incident.detected_at), label: "Incident detected" }
      : null,
    latestCorrectiveDeployment?.deployed_at
      ? { timestamp: String(latestCorrectiveDeployment.deployed_at), label: "Fix applied" }
      : null,
    incident.recovered_at
      ? { timestamp: String(incident.recovered_at), label: "Recovery verified" }
      : null,
  ].filter((value): value is { timestamp: string; label: string } => value !== null);

  const summary = `Paid traffic continued at ${formatMoney(
    baseline.hourlySpend,
  )}/hour, but attributed conversions fell from ${baselineAttributed} to ${degradedAttributed}. The strongest related change was deployment ${deploymentCandidate?.version ?? "v42"}, which removed the click ID from the landing-page redirect.`;
  const executiveSummary = `CatchDrift identified this failure ${DEMO_STORY.detectionMinutes} minutes after deployment ${DEMO_STORY.deploymentId}, with ${formatMoneyMinor(DEMO_STORY.exposureDuringDetectionMinor)} of spend currently exposed and ${formatMoneyMinor(DEMO_STORY.potentialDailyExposureMinor)} in potential daily exposure.`;

  const freshnessAtEvaluation = evaluationFreshness
    ? evaluationFreshness.fresh
      ? "All required sources fresh at evaluation time"
      : `Decision suppression active at evaluation time: ${evaluationFreshness.staleReasons.join(", ") || evaluationFreshness.suppressionReason || "source freshness requirement not met"}`
    : sourceFreshnessLabel(sourceHealth as never[]);

  const recommendedAction = `Inspect click-ID forwarding in deployment ${deploymentCandidate?.version ?? "v42"} and compare redirect behavior before and after the release.`;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <IncidentLiveRefresh status={String(incident.status)} />

      <header className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Incident detail</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">
          Tracking dropped after deployment {deploymentCandidate?.version ?? "v42"}
        </h1>
        <p className="mt-2 inline-flex rounded-full border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800">
          {normalizeStatus(String(incident.status))}
        </p>
        <p className="mt-3 text-sm leading-6 text-slate-700">{executiveSummary}</p>
        <p className="mt-2 text-sm leading-6 text-slate-600">{summary}</p>
      </header>

      <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <MetricTile label="Spend protected" value={formatMoneyMinor(DEMO_STORY.exposureDuringDetectionMinor)} />
        <MetricTile label="Time to detection" value={`${DEMO_STORY.detectionMinutes} min`} />
        <MetricTile label="Campaigns monitored" value={String(DEMO_STORY.campaignsMonitored)} />
        <MetricTile label="Estimated loss avoided" value={formatMoneyMinor(DEMO_STORY.exposureDuringDetectionMinor)} />
        <MetricTile label="Incident cause" value={`Deployment ${DEMO_STORY.deploymentId}`} />
      </section>

      <section className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-rose-900">Executive incident brief</h2>
        <p className="mt-3 text-sm text-rose-900">
          CatchDrift detected a likely attribution failure affecting the Meta Prospecting campaign.
          Spend and clicks remained normal, but attributed sessions dropped {DEMO_STORY.conversionDeclinePercent}% following deployment
          {" "}{DEMO_STORY.deploymentId}. Estimated spend currently exposed: {formatMoneyMinor(DEMO_STORY.exposureDuringDetectionMinor)}.
          Recommended action: verify the landing-page tracking script introduced by deployment {DEMO_STORY.deploymentId}.
        </p>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <NarrativeTile
            title="Why we believe this"
            body="Signal degradation exceeded threshold and persisted for required intervals while spend remained active."
          />
          <NarrativeTile
            title="Evidence"
            body="Spend and clicks stayed flat while sessions and attributed conversions dropped immediately after deployment."
          />
          <NarrativeTile
            title="Recommended investigation"
            body="Confirm click_id forwarding in redirect behavior, script load order, and attribution parameter handling."
          />
          <NarrativeTile
            title="What CatchDrift intentionally did not automate"
            body="CatchDrift did not pause campaigns, edit spend, or auto-rollback deployment changes."
          />
        </div>
      </section>

      {(String(incident.status) === "recovered" || String(incident.status) === "resolved") ? (
        <section className="mb-6 rounded-2xl border border-emerald-300 bg-emerald-50 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-emerald-900">Incident resolved</h2>
          <p className="mt-2 text-sm text-emerald-900">
            CatchDrift verified that session and conversion signals returned to expected range for
            three consecutive evaluation windows.
          </p>
          <ul className="mt-3 space-y-1 text-sm text-emerald-900">
            <li>Estimated exposure limited: {formatMoneyMinor(DEMO_STORY.exposureDuringDetectionMinor)}</li>
            <li>Potential daily exposure: {formatMoneyMinor(DEMO_STORY.potentialDailyExposureMinor)}</li>
            <li>Detection time: {DEMO_STORY.detectionMinutes} minutes</li>
          </ul>
        </section>
      ) : null}

      <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Release change</h2>
        <pre className="mt-3 overflow-x-auto rounded-md bg-slate-950 p-3 text-sm text-slate-100">
{`Before: ${deploymentCandidate?.changes_json?.[0]?.previousValue ?? "/apply?click_id={{click_id}}"}
After:  ${deploymentCandidate?.changes_json?.[0]?.nextValue ?? "/apply"}`}
        </pre>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Why CatchDrift flagged it</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-700">
            <li>
              Click-to-session loss increased from {formatPercent(baseline.clickToSessionLossPct)} to{" "}
              {formatPercent(metric.current.clickToSessionLossPct)}.
            </li>
            <li>
              Attribution rate fell from {formatPercent(baseline.attributionRatePct)} to{" "}
              {formatPercent(metric.current.attributionRatePct)}.
            </li>
            <li>The drop persisted for {metric.degradedStreakCount} intervals.</li>
            <li>
              Deployment {deploymentCandidate?.version ?? "v42"} occurred {deploymentGapMinutes ?? "n/a"} minutes before the change.
            </li>
            <li>
              {deploymentScore?.components?.noCompetingDeployment
                ? "No competing deployment occurred nearby."
                : "Competing deployments may exist nearby."}
            </li>
          </ul>
          <p className="mt-3 text-xs text-slate-600">
            This does not prove deployment {deploymentCandidate?.version ?? "v42"} caused the issue. It is the strongest change associated with the timing and affected path.
          </p>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Estimated exposure</h2>
          <ul className="mt-3 space-y-2 text-sm text-slate-700">
            <li>
              <span className="font-medium text-slate-900">Observed during replay:</span>{" "}
              {exposureLabel(
                incident.exposure_low_minor == null ? null : Number(incident.exposure_low_minor),
                incident.exposure_high_minor == null ? null : Number(incident.exposure_high_minor),
                String(incident.currency),
              )}
            </li>
            <li>
              <span className="font-medium text-slate-900">Potential exposure with a 90-minute reporting delay:</span>{" "}
              {potentialAdditionalLow == null || potentialAdditionalHigh == null
                ? "n/a"
                : `${formatMoney(potentialAdditionalLow)}-${formatMoney(potentialAdditionalHigh)}`}
            </li>
          </ul>
          <p className="mt-3 text-xs text-slate-600">
            The second value is hypothetical exposure under delayed discovery, not confirmed loss.
          </p>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Recommended action</h2>
          <p className="mt-3 text-sm text-slate-700">{recommendedAction}</p>
          <div className="mt-4">
            <IncidentActions incidentId={incidentId} status={String(incident.status)} />
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Recovery</h2>
          <ul className="mt-3 space-y-2 text-sm text-slate-700">
            <li>Corrective deployment: {String(latestCorrectiveDeployment?.version ?? "v43")}</li>
            <li>Required recovery intervals: 3</li>
            <li>Completed recovery intervals: {recoveredCount}</li>
            <li>
              Recovery timestamp: {incident.recovered_at ? new Date(String(incident.recovered_at)).toLocaleString() : "Not yet recovered"}
            </li>
          </ul>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
          <details>
            <summary className="cursor-pointer text-sm font-semibold text-slate-900">
              View technical evidence
            </summary>

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
                    metric="Click-to-session change"
                    baseline={formatPercent(metric.current.clickLossIncreasePoints)}
                    degraded={formatPercent(threshold.clickLossIncreasePoints)}
                    change={metric.current.clickLossIncreasePoints >= threshold.clickLossIncreasePoints ? "Pass" : "Fail"}
                  />
                  <ComparisonRow
                    metric="Attribution change"
                    baseline={formatPercent(metric.current.attributionDeclinePercent)}
                    degraded={formatPercent(threshold.attributionDeclinePercent)}
                    change={metric.current.attributionDeclinePercent >= threshold.attributionDeclinePercent ? "Pass" : "Fail"}
                  />
                  <ComparisonRow
                    metric="Persistence"
                    baseline={`${metric.degradedStreakCount} intervals`}
                    degraded={`${threshold.persistenceIntervals} intervals`}
                    change={metric.degradedStreakCount >= threshold.persistenceIntervals ? "Pass" : "Fail"}
                  />
                  <ComparisonRow
                    metric="Required source freshness"
                    baseline={freshnessAtEvaluation}
                    degraded="all required sources decision-ready"
                    change={freshnessAtEvaluation.startsWith("All") ? "Pass" : "Suppressed"}
                  />
                </tbody>
              </table>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Correlation score components</h3>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                  <li>Total score: {deploymentScore ? `${deploymentScore.total} (${deploymentScore.band})` : "n/a"}</li>
                  <li>Campaign mapped: {deploymentScore?.components?.campaignMapped ?? "n/a"}</li>
                  <li>Tracking-sensitive change: {deploymentScore?.components?.trackingSensitiveChanged ?? "n/a"}</li>
                  <li>Temporal proximity: {deploymentScore?.components?.temporalProximity ?? "n/a"}</li>
                  <li>Healthy before deployment: {deploymentScore?.components?.healthyBeforeDeployment ?? "n/a"}</li>
                  <li>No competing deployment: {deploymentScore?.components?.noCompetingDeployment ?? "n/a"}</li>
                </ul>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Recovery evidence</h3>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                  <li>Detected at: {new Date(String(incident.detected_at)).toLocaleString()}</li>
                  <li>Recovered at: {incident.recovered_at ? new Date(String(incident.recovered_at)).toLocaleString() : "Not yet recovered"}</li>
                  <li>Current status: {String(incident.status)}</li>
                  <li>Changed field: {affectedComponent}</li>
                </ul>
              </div>
            </div>

            <section className="mt-6">
              <h3 className="text-sm font-semibold text-slate-900">Evidence timeline</h3>
              <p className="mt-1 text-sm text-slate-600">
                Baseline and degraded intervals with spend, revenue, click loss, and attribution rate.
              </p>
              <div className="mt-4">
                <EvidenceTimeline rows={timeline as never[]} markers={timelineMarkers} />
              </div>
            </section>

            <section className="mt-6">
              <h3 className="text-sm font-semibold text-slate-900">Raw evidence</h3>
              <pre className="mt-3 overflow-x-auto rounded bg-slate-950 p-3 text-xs text-slate-100">
                {JSON.stringify({ evidence, events }, null, 2)}
              </pre>
            </section>
          </details>
        </section>
      </div>
    </div>
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-base font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function NarrativeTile({ title, body }: { title: string; body: string }) {
  return (
    <article className="rounded-xl border border-rose-200 bg-white p-3">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 text-sm text-slate-700">{body}</p>
    </article>
  );
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
