import { HeroReplayLauncher } from "@/components/hero-replay-launcher";
import { SimulationControls } from "@/components/simulation-controls";
import { DEMO_SCENARIO } from "@/lib/constants";
import { REPLAY_DEMO_SECTION_ID } from "@/lib/demo-replay-events";
import { formatMoneyMinor, formatMoneyRangeMinor } from "@/lib/format";
import {
  CANONICAL_MANUAL_DISCOVERY_DELAY_MINUTES,
  CANONICAL_REPLAY_TIMELINE_OFFSETS_MINUTES,
  DEFAULT_EXPOSURE_RATE_PER_HOUR_MINOR,
  exposureRangeForMinutes,
  PRESENTATION_COPY,
} from "@/lib/presentation-contract";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const detectionDurationMinutes =
    CANONICAL_REPLAY_TIMELINE_OFFSETS_MINUTES.detection - CANONICAL_REPLAY_TIMELINE_OFFSETS_MINUTES.deployment;

  const beforeDetection = exposureRangeForMinutes({
    lowPerHourMinor: DEFAULT_EXPOSURE_RATE_PER_HOUR_MINOR.low,
    highPerHourMinor: DEFAULT_EXPOSURE_RATE_PER_HOUR_MINOR.high,
    minutes: detectionDurationMinutes,
  });
  const dailyExposure = exposureRangeForMinutes({
    lowPerHourMinor: DEFAULT_EXPOSURE_RATE_PER_HOUR_MINOR.low,
    highPerHourMinor: DEFAULT_EXPOSURE_RATE_PER_HOUR_MINOR.high,
    minutes: 24 * 60,
  });
  const manualDiscoveryExposure = exposureRangeForMinutes({
    lowPerHourMinor: DEFAULT_EXPOSURE_RATE_PER_HOUR_MINOR.low,
    highPerHourMinor: DEFAULT_EXPOSURE_RATE_PER_HOUR_MINOR.high,
    minutes: CANONICAL_MANUAL_DISCOVERY_DELAY_MINUTES,
  });
  const additionalExposureSurfaced = exposureRangeForMinutes({
    lowPerHourMinor: DEFAULT_EXPOSURE_RATE_PER_HOUR_MINOR.low,
    highPerHourMinor: DEFAULT_EXPOSURE_RATE_PER_HOUR_MINOR.high,
    minutes: CANONICAL_MANUAL_DISCOVERY_DELAY_MINUTES - detectionDurationMinutes,
  });
  const activeSpendLabel = `${formatMoneyMinor(DEMO_SCENARIO.spendPerHourMinor)}/hour`;
  const beforeDetectionLabel = formatMoneyRangeMinor(beforeDetection.lowMinor, beforeDetection.highMinor);
  const manualDiscoveryExposureLabel = formatMoneyRangeMinor(
    manualDiscoveryExposure.lowMinor,
    manualDiscoveryExposure.highMinor,
  );
  const additionalExposureSurfacedLabel = formatMoneyRangeMinor(
    additionalExposureSurfaced.lowMinor,
    additionalExposureSurfaced.highMinor,
  );
  const dailyExposureLabel = formatMoneyRangeMinor(dailyExposure.lowMinor, dailyExposure.highMinor);

  const heroProofPoints = [
    {
      label: "What failed",
      title: "Attribution broke while spend continued.",
      body: `Deployment ${DEMO_SCENARIO.deploymentIdentifier} removed click_id forwarding while campaigns kept buying traffic at ${activeSpendLabel}.`,
    },
    {
      label: "What CatchDrift did",
      title: `Detected confirmed drift in ${detectionDurationMinutes} minutes.`,
      body: "The replay correlates falling attributed sessions and conversions to the deployment before normal reporting catches up.",
    },
    {
      label: "What the buyer gained",
      title: "A prioritized, evidence-backed response path.",
      body: `The incident quantifies ${beforeDetectionLabel} of exposure before detection and shows the next action, evidence, guardrails, and recovery check.`,
    },
  ];

  const controlLoopStages = ["Detect", "Correlate", "Quantify", "Investigate", "Govern action", "Verify recovery"];

  const detectionCopy = [
    `Deployment ${DEMO_SCENARIO.deploymentIdentifier} removes click_id forwarding while spend continues at ${activeSpendLabel}.`,
    `CatchDrift creates an incident after ${detectionDurationMinutes} minutes of confirmed degradation, with ${beforeDetectionLabel} accumulated before automated detection.`,
    `A ${CANONICAL_MANUAL_DISCOVERY_DELAY_MINUTES}-minute manual-discovery delay would put ${manualDiscoveryExposureLabel} at risk, so the replay surfaces ${additionalExposureSurfacedLabel} of additional estimated exposure before that delayed review.`,
  ].join(" ");

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="overflow-hidden rounded-2xl border border-slate-900 bg-slate-950 text-white shadow-sm">
        <div className="grid gap-0 lg:grid-cols-[1.08fr_0.92fr]">
          <div className="p-6 sm:p-7 lg:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">Paid-media control loop</p>
            <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Catch attribution failures before today&apos;s spend becomes unusable.
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-200">
              In this replay, attribution breaks while spend continues. CatchDrift detects the drift before normal
              reporting would, ties it to the deployment, quantifies exposure, and turns the incident into a governed
              recovery path.
            </p>

            <div className="mt-6 flex flex-wrap gap-2">
              <HeroReplayLauncher />
              <a
                href="/architecture"
                className="rounded-md border border-slate-500 px-3 py-2 text-sm font-semibold text-slate-100"
              >
                {PRESENTATION_COPY.deterministicGuardrailsCta}
              </a>
            </div>
          </div>

          <div className="border-t border-slate-800 bg-slate-900/70 lg:border-l lg:border-t-0">
            <ol className="divide-y divide-slate-800">
              {heroProofPoints.map((point) => (
                <li key={point.label} className="p-5 sm:p-6">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-200">{point.label}</p>
                  <h2 className="mt-2 text-lg font-semibold text-white">{point.title}</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-300">{point.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div className="grid border-t border-slate-800 bg-white text-slate-950 sm:grid-cols-3">
          <div className="p-5 sm:border-r sm:border-slate-200">
            <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">Exposure before detection</p>
            <p className="mt-1 text-3xl font-semibold text-rose-950">{beforeDetectionLabel}</p>
            <p className="mt-1 text-sm text-slate-600">Confirmed before automated detection.</p>
          </div>
          <div className="border-t border-slate-200 p-5 sm:border-r sm:border-t-0 sm:border-slate-200">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Manual delay avoided</p>
            <p className="mt-1 text-3xl font-semibold text-slate-950">{additionalExposureSurfacedLabel}</p>
            <p className="mt-1 text-sm text-slate-600">Surfaced before a 90-minute review.</p>
          </div>
          <div className="border-t border-slate-200 p-5 sm:border-t-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
              {PRESENTATION_COPY.exposureLabels.potentialDaily}
            </p>
            <p className="mt-1 text-3xl font-semibold text-slate-950">{dailyExposureLabel}</p>
            <p className="mt-1 text-sm text-slate-600">Formula-derived projection, not confirmed loss.</p>
          </div>
        </div>
      </header>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Operational loop shown in the replay</h2>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              A landing-page deployment breaks click tracking. Campaign spend and clicks continue, but
              attributed sessions and conversions fall. CatchDrift confirms the degradation with deterministic
              rules, creates an incident, identifies the relevant deployment, prepares an AI-assisted investigation
              brief from persisted evidence, and verifies the repair.
            </p>
          </div>
          <ol className="grid gap-2 text-sm font-semibold text-slate-800 sm:grid-cols-2">
            {controlLoopStages.map((stage, index) => (
              <li key={stage} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <span className="mr-2 text-xs font-bold text-cyan-700">{String(index + 1).padStart(2, "0")}</span>
                {stage}
              </li>
            ))}
          </ol>
        </div>
        <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">{detectionCopy}</p>
      </section>

      <div id={REPLAY_DEMO_SECTION_ID} className="mt-6 scroll-mt-6">
        <SimulationControls />
      </div>

      <p className="mt-4 rounded-md bg-slate-50 p-3 text-xs text-slate-600">
        Fresh replay environment. Each run resets the demo workspace before seeding evidence, and historical replay
        evidence remains queryable after the scenario completes.
      </p>
    </div>
  );
}
