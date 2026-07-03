import Link from "next/link";
import { getDeterministicDemoExposureEstimate } from "@/domain/demo-financial";
import { listSourceHealth } from "@/domain/engine";
import { formatMoney } from "@/lib/format";
import { SimulationControls } from "@/components/simulation-controls";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const health = await listSourceHealth();
  const readyCount = health.filter((row) => !Boolean(row.suppresses_decisions)).length;
  const suppressingCount = health.filter((row) => Boolean(row.suppresses_decisions)).length;
  const estimate = getDeterministicDemoExposureEstimate();
  const assumedDelayHours = 1.5;
  const additionalLow = estimate.low * assumedDelayHours;
  const additionalHigh = estimate.high * assumedDelayHours;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">CatchDrift</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
          Catch tracking failures before paid spend keeps leaking.
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-700">
          CatchDrift detects persistent conversion-path degradation, connects it to the strongest
          correlated operational change, estimates financial exposure, and verifies recovery.
        </p>

        <div className="mt-5 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <ProofItem label="Campaign spend" value={`${formatMoney(estimate.hourlySpend)}/hour`} />
          <ProofItem label="Click-to-session loss" value="rises from baseline" />
          <ProofItem label="Attribution loss" value="persistent across intervals" />
          <ProofItem label="Estimated exposure" value={`${formatMoney(estimate.low)}-${formatMoney(estimate.high)}/hour`} />
          <ProofItem label="Correlated change" value="Deployment v42" />
          <ProofItem
            label="Current state"
            value={suppressingCount === 0 ? "decision-ready" : "freshness-suppressed"}
          />
        </div>

        <p className="mt-4 rounded-md bg-slate-50 p-3 text-xs text-slate-600">
          Campaign metric values are controlled for deterministic demonstration. Ingestion, worker processing,
          detection, persistence, correlation, exposure calculation, and recovery tracking are real.
        </p>
      </header>

      <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Live replay sequence</h2>
        <p className="mt-2 text-sm text-slate-700">
          1. Healthy 2. Deployment 3. Degradation 4. Incident detected 5. Corrective deployment 6. Recovery verified.
        </p>
      </section>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <SimulationControls />
        <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Why this saves money</h2>
          <div className="mt-3 space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
            <p>
              <span className="font-medium text-slate-900">Estimated exposure:</span>{" "}
              {formatMoney(estimate.low)}-{formatMoney(estimate.high)}/hour
            </p>
            <p>
              <span className="font-medium text-slate-900">Assumed manual discovery delay:</span> 90 minutes
            </p>
            <p>
              <span className="font-medium text-slate-900">Potential additional exposure surfaced earlier:</span>{" "}
              {formatMoney(additionalLow)}-{formatMoney(additionalHigh)}
            </p>
          </div>
          <p className="mt-3 text-xs text-slate-600">
            This is not confirmed money saved. It is estimated financial exposure surfaced while a
            failure could otherwise remain unnoticed.
          </p>

          <h3 className="mt-5 text-sm font-semibold text-slate-900">Source health summary</h3>
          <p className="mt-2 text-2xl font-semibold text-slate-900">
            {readyCount}/{health.length}
          </p>
          <p className="text-xs text-slate-600">
            {suppressingCount === 0 ? "sources ready for deterministic decisions" : `${suppressingCount} source(s) suppressing decisions`}
          </p>

          <div className="mt-4 space-y-2 text-sm">
            <Link className="block text-slate-800 underline" href="/incidents">
              Go to exception queue
            </Link>
            <Link className="block text-slate-800 underline" href="/sources">
              Open source health
            </Link>
            <Link className="block text-slate-800 underline" href="/architecture">
              Architecture and implementation details
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}

function ProofItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}
