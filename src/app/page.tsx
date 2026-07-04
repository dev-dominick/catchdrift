import { SimulationControls } from "@/components/simulation-controls";
import { formatMoneyRangeMinor } from "@/lib/format";
import {
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

  const detectionCopy = `CatchDrift identified a tracking failure approximately ${detectionDurationMinutes} minutes after deployment, with ${formatMoneyRangeMinor(beforeDetection.lowMinor, beforeDetection.highMinor)} in exposure before detection.`;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">CatchDrift</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
          Catch tracking failures while campaigns are still spending.
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-700">
          CatchDrift detects when attribution breaks, estimates the financial exposure, identifies the most
          relevant recent change, and verifies recovery.
        </p>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Public demo using deterministic replay data. No advertising credentials required.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <a href="#incident-demo" className="rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white">
            {PRESENTATION_COPY.replayCta}
          </a>
          <a
            href="/architecture"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700"
          >
            See how detection works
          </a>
        </div>
      </header>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">What happens in this demo</h2>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              A landing-page deployment breaks click tracking. Campaign spend and clicks continue, but
              attributed sessions and conversions fall. CatchDrift confirms the degradation, creates an
              incident, identifies the relevant deployment, and verifies the repair.
            </p>
          </div>
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">Primary exposure metric</p>
            <p className="mt-1 text-2xl font-semibold text-rose-950">
              {formatMoneyRangeMinor(beforeDetection.lowMinor, beforeDetection.highMinor)}
            </p>
            <p className="mt-1 text-sm text-rose-900">Exposure before detection in the replay scenario.</p>
          </div>
        </div>
        <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">{detectionCopy}</p>
      </section>

      <div id="incident-demo" className="mt-6 scroll-mt-6">
        <SimulationControls />
      </div>

      <p className="mt-4 rounded-md bg-slate-50 p-3 text-xs text-slate-600">
        Controlled simulation environment. Historical replay evidence remains queryable after the scenario completes.
      </p>
    </div>
  );
}
