import Link from "next/link";
import { listSourceHealth } from "@/domain/engine";
import { SimulationControls } from "@/components/simulation-controls";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const health = await listSourceHealth();
  const healthyCount = health.filter((row) => row.freshness_state === "healthy").length;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">CatchDrift MVP</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
          Catch campaign drift before it becomes expensive.
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-700">
          CatchDrift is a deployment-aware campaign protection system that detects tracking integrity failures while spend is active, correlates evidence to deployments, calculates exposure, and verifies recovery.
        </p>
        <p className="mt-4 rounded-md bg-slate-50 p-3 text-xs text-slate-600">
          Campaign metric values are controlled for deterministic demonstration. Ingestion, worker processing, detection, persistence, correlation, exposure calculation, and recovery tracking are real.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <SimulationControls />
        <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Source health summary</h2>
          <p className="mt-2 text-2xl font-semibold text-slate-900">
            {healthyCount}/{health.length}
          </p>
          <p className="text-xs text-slate-600">fresh sources</p>

          <div className="mt-4 space-y-2 text-sm">
            <Link className="block text-slate-800 underline" href="/incidents">
              Go to exception queue
            </Link>
            <Link className="block text-slate-800 underline" href="/sources">
              Open source health
            </Link>
            <Link className="block text-slate-800 underline" href="/architecture">
              Architecture and MVP boundary
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
