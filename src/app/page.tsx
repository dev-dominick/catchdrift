import { SimulationControls } from "@/components/simulation-controls";
import { DEMO_SCENARIO } from "@/lib/constants";
import { formatMoneyMinor } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const detectionCopy = `CatchDrift identified a tracking failure ${DEMO_SCENARIO.detectionDurationMinutes} minutes after deployment, with ${formatMoneyMinor(DEMO_SCENARIO.potentialDailyExposureMinor)} in potential daily spend exposed.`;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">CatchDrift</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
          Catch tracking failures before they become wasted media spend.
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-700">
          Most tracking failures do not stop ad spend. They silently destroy attribution while campaigns
          continue running.
        </p>
        <p className="mt-2 max-w-3xl rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium leading-6 text-rose-900">
          {detectionCopy}
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <a href="#incident-demo" className="rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white">
            Run incident simulation
          </a>
          <a
            href="/architecture"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700"
          >
            See how detection works
          </a>
        </div>
      </header>
      <div id="incident-demo" className="mt-6 scroll-mt-6">
        <SimulationControls />
      </div>

      <p className="mt-4 rounded-md bg-slate-50 p-3 text-xs text-slate-600">
        Controlled simulation environment. Historical simulation evidence remains queryable after the
        scenario completes.
      </p>
    </div>
  );
}
