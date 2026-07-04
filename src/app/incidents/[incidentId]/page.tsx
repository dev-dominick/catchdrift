import { differenceInMinutes } from "date-fns";
import { notFound } from "next/navigation";
import { EvidenceTimeline } from "@/components/evidence-timeline";
import { IncidentActions } from "@/components/incident-actions";
import { IncidentLiveRefresh } from "@/components/incident-live-refresh";
import { getIncident } from "@/domain/engine";
import {
  buildIncidentSummaries,
  buildTimelineMarkers,
  deriveIncidentTimelineRows,
  normalizeIncidentStatus,
  parseTimelineRows,
  pickEvidence,
  recoveryIntervalsCount,
  sourceFreshnessLabel,
  type BaselineEvidence,
  type DeploymentEvidence,
  type MetricEvidence,
  type ThresholdEvidence,
} from "@/hooks/incidents/incident-detail";
import { DEMO_SCENARIO } from "@/lib/constants";
import { exposureLabel, formatMoney, formatMoneyMinor, formatPercent } from "@/lib/format";

export const dynamic = "force-dynamic";

type Params = {
  incidentId: string;
};

async function getIncidentWithRetry(incidentId: string, attempts = 4): Promise<Awaited<ReturnType<typeof getIncident>>> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const data = await getIncident(incidentId);
    if (data) {
      return data;
    }

    if (attempt < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }

  return null;
}

export default async function IncidentDetailPage({ params }: { params: Promise<Params> }) {
  const { incidentId } = await params;
  const data = await getIncidentWithRetry(incidentId);

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
  const { baselineRow, degradedRow } = deriveIncidentTimelineRows({
    rows,
    evaluationWindowStart: metric.evaluationWindowStart,
    detectedAt: String(incident.detected_at),
  });

  const baselineAttributed = Number(baselineRow.attributed_conversions);
  const degradedAttributed = Number(degradedRow.attributed_conversions);

  const deploymentCandidate = deployment?.candidate ?? null;
  const deploymentScore = deployment?.score ?? null;
  const affectedComponent = deploymentCandidate?.changes_json?.[0]?.path ?? "redirectUrl";
  const deploymentGapMinutes = deploymentCandidate
    ? Math.abs(differenceInMinutes(new Date(metric.evaluationWindowStart), new Date(deploymentCandidate.deployed_at)))
    : null;

  const exposureLowHourly = incident.exposure_low_minor == null ? null : Number(incident.exposure_low_minor) / 100;
  const exposureHighHourly = incident.exposure_high_minor == null ? null : Number(incident.exposure_high_minor) / 100;
  const potentialAdditionalLow = exposureLowHourly == null ? null : exposureLowHourly * 1.5;
  const potentialAdditionalHigh = exposureHighHourly == null ? null : exposureHighHourly * 1.5;
  const recoveredCount = recoveryIntervalsCount(rows, baseline);

  const latestCorrectiveDeployment = (deployments as Array<Record<string, unknown>>).find(
    (item) => String(item.version) !== String(deploymentCandidate?.version),
  );
  const timelineMarkers = buildTimelineMarkers({
    deployedAt: deploymentCandidate?.deployed_at ? String(deploymentCandidate.deployed_at) : null,
    detectedAt: incident.detected_at ? String(incident.detected_at) : null,
    fixedAt: latestCorrectiveDeployment?.deployed_at ? String(latestCorrectiveDeployment.deployed_at) : null,
    recoveredAt: incident.recovered_at ? String(incident.recovered_at) : null,
  });

  const { executiveSummary, summary } = buildIncidentSummaries({
    hourlySpendLabel: formatMoney(baseline.hourlySpend),
    baselineAttributed,
    degradedAttributed,
    deploymentVersion: deploymentCandidate?.version ?? "",
    deploymentIdentifier: DEMO_SCENARIO.deploymentIdentifier,
    detectionDurationMinutes: DEMO_SCENARIO.detectionDurationMinutes,
    exposureAtDetectionLabel: formatMoneyMinor(DEMO_SCENARIO.exposureAtDetectionMinor),
    potentialDailyExposureLabel: formatMoneyMinor(DEMO_SCENARIO.potentialDailyExposureMinor),
  });

  const freshnessAtEvaluation = evaluationFreshness
    ? evaluationFreshness.fresh
      ? "All required sources fresh at evaluation time"
      : `Decision suppression active at evaluation time: ${evaluationFreshness.staleReasons.join(", ") || evaluationFreshness.suppressionReason || "source freshness requirement not met"}`
    : sourceFreshnessLabel(sourceHealth as never[]);

  const recommendedAction = DEMO_SCENARIO.recommendedAction;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <IncidentLiveRefresh status={String(incident.status)} />

      <header className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Incident detail</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">
          {DEMO_SCENARIO.incidentTitle}
        </h1>
        <p className="mt-2 inline-flex rounded-full border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800">
          {normalizeIncidentStatus(String(incident.status))}
        </p>
        <p className="mt-3 text-sm leading-6 text-slate-700">{executiveSummary}</p>
        <p className="mt-2 text-sm leading-6 text-slate-600">{summary}</p>
      </header>

      <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricTile label="Potential daily exposure" value={formatMoneyMinor(DEMO_SCENARIO.potentialDailyExposureMinor)} />
        <MetricTile label="Exposure before detection" value={formatMoneyMinor(DEMO_SCENARIO.exposureAtDetectionMinor)} />
        <MetricTile label="Detection time" value={`${DEMO_SCENARIO.detectionDurationMinutes} min`} />
        <MetricTile label="Attribution drop" value={`${DEMO_SCENARIO.attributionDeclinePercent}%`} />
      </section>

      <section className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-rose-900">Executive incident brief</h2>
        <p className="mt-3 text-sm text-rose-900">
          CatchDrift detected a likely attribution failure affecting the Meta Prospecting campaign.
          Spend and clicks remained normal, but attributed sessions dropped {DEMO_SCENARIO.conversionDeclinePercent}% following deployment
          {" "}{DEMO_SCENARIO.deploymentIdentifier}. Estimated spend currently exposed: {formatMoneyMinor(DEMO_SCENARIO.exposureAtDetectionMinor)}.
          Recommended action: {DEMO_SCENARIO.recommendedAction}
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
            {DEMO_SCENARIO.finalRecoveryStatement}
          </p>
          <ul className="mt-3 space-y-1 text-sm text-emerald-900">
            <li>Exposure before recovery: {formatMoneyMinor(DEMO_SCENARIO.exposureAtDetectionMinor)}</li>
            <li>Potential daily exposure: {formatMoneyMinor(DEMO_SCENARIO.potentialDailyExposureMinor)}</li>
            <li>Detection time: {DEMO_SCENARIO.detectionDurationMinutes} minutes</li>
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
              Deployment {deploymentCandidate?.version ?? DEMO_SCENARIO.deploymentIdentifier} occurred {deploymentGapMinutes ?? "n/a"} minutes before the change.
            </li>
            <li>
              {deploymentScore?.components?.noCompetingDeployment
                ? "No competing deployment occurred nearby."
                : "Competing deployments may exist nearby."}
            </li>
          </ul>
          <p className="mt-3 text-xs text-slate-600">
            This does not prove deployment {deploymentCandidate?.version ?? DEMO_SCENARIO.deploymentIdentifier} caused the issue. It is the strongest change associated with the timing and affected path.
          </p>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Estimated exposure</h2>
          <ul className="mt-3 space-y-2 text-sm text-slate-700">
            <li>
              <span className="font-medium text-slate-900">Observed during simulation:</span>{" "}
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
            <li>Corrective deployment: {String(latestCorrectiveDeployment?.version ?? DEMO_SCENARIO.correctiveDeploymentIdentifier)}</li>
            <li>Required recovery intervals: {DEMO_SCENARIO.recoveryWindowCount}</li>
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
              <ul className="mt-3 flex flex-wrap gap-2 text-xs text-slate-700">
                {timelineMarkers.map((marker) => (
                  <li key={`${marker.label}-${marker.timestamp}`} className="rounded-full border border-slate-300 bg-slate-50 px-2 py-1">
                    {marker.label}: {new Date(marker.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </li>
                ))}
              </ul>
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
