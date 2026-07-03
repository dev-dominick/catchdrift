import Link from "next/link";
import { getDeterministicDemoExposureEstimate } from "@/domain/demo-financial";
import { listSourceHealth } from "@/domain/engine";
import { formatMoney } from "@/lib/format";
import { SimulationControls } from "@/components/simulation-controls";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const health = await listSourceHealth();
  const healthyCount = health.filter((row) => row.freshness_state === "healthy").length;
  const estimate = getDeterministicDemoExposureEstimate();
  const assumedDelayHours = 1.5;
  const additionalLow = estimate.low * assumedDelayHours;
  const additionalHigh = estimate.high * assumedDelayHours;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">CatchDrift MVP</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
          See CatchDrift protect a campaign spending {formatMoney(estimate.hourlySpend)}/hour.
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-700">
          Run a simulated tracking failure caused by a deployment. CatchDrift detects the degradation,
          shows the evidence, estimates financial exposure, and verifies recovery after the corrective
          deployment.
        </p>
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Estimated exposure range from deterministic replay profile: {formatMoney(estimate.low)}-
          {formatMoney(estimate.high)}/hour.
        </div>
        <p className="mt-4 rounded-md bg-slate-50 p-3 text-xs text-slate-600">
          Campaign metric values are controlled for deterministic demonstration. Ingestion, worker processing, detection, persistence, correlation, exposure calculation, and recovery tracking are real.
        </p>
      </header>

      <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Demo sequence</h2>
        <p className="mt-2 text-sm text-slate-700">
          Healthy campaign {"->"} deployment v42 {"->"} tracking degradation {"->"} spend continues
          {"->"} incident detected {"->"} buyer investigates {"->"} deployment v43 {"->"} recovery
          verified.
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
