import { SimulationControls } from "@/components/simulation-controls";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">CatchDrift</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
          Catch tracking failures before they burn through more spend.
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-700">
          CatchDrift watches for the gap between paid clicks and the events that should follow
          them.
        </p>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
          In this replay, a landing-page release removes a click ID. Traffic keeps flowing,
          attribution drops, and CatchDrift traces the failure back to the change.
        </p>
      </header>
      <div className="mt-6">
        <SimulationControls />
      </div>

      <p className="mt-4 rounded-md bg-slate-50 p-3 text-xs text-slate-600">
        Demo data is controlled. Detection, incident creation, change correlation, and recovery
        checks run through the application&apos;s real evaluation path.
      </p>
    </div>
  );
}
