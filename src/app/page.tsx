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
          Catch tracking failures while your campaigns are still spending.
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-700">
          CatchDrift detects when a landing-page or tracking change damages attribution, connects
          the failure to recent operational changes, estimates active spend exposure, and verifies
          recovery before manual reporting catches up.
        </p>

        <div className="mt-5 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <ProofItem label="Active spend at risk" value={`${formatMoney(estimate.hourlySpend)}/hour`} />
          <ProofItem label="Estimated exposure rate" value={`${formatMoney(estimate.low)}-${formatMoney(estimate.high)}/hour`} />
          <ProofItem label="Detection window" value="3 degraded intervals (15 minutes)" />
          <ProofItem label="Expected manual discovery delay" value="90 minutes" />
          <ProofItem label="Exposure surfaced earlier" value={`${formatMoney(additionalLow)}-${formatMoney(additionalHigh)}`} />
        </div>

        <p className="mt-4 rounded-md bg-slate-50 p-3 text-xs text-slate-600">
          Controlled campaign data. Real ingestion, detection, evidence correlation and recovery verification.
        </p>
      </header>

      <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">What you will see in the 25-second replay</h2>
        <p className="mt-2 text-sm text-slate-700">
          Campaign healthy, landing-page release deployed, attribution degrades while spend remains
          active, CatchDrift opens an incident, exposure continues accumulating, and recovery is
          verified against explicit criteria.
        </p>
      </section>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <SimulationControls />
        <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Demo financial outcome</h2>
          <div className="mt-3 space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
            <p>
              <span className="font-medium text-slate-900">Active spend at risk:</span> {formatMoney(estimate.hourlySpend)}/hour
            </p>
            <p>
              <span className="font-medium text-slate-900">Estimated exposure rate:</span>{" "}
              {formatMoney(estimate.low)}-{formatMoney(estimate.high)}/hour
            </p>
            <p>
              <span className="font-medium text-slate-900">Detection window:</span> 3 degraded intervals (15 minutes)
            </p>
            <p>
              <span className="font-medium text-slate-900">Expected manual discovery delay:</span> 90 minutes
            </p>
            <p>
              <span className="font-medium text-slate-900">Exposure surfaced earlier:</span>{" "}
              {formatMoney(additionalLow)}-{formatMoney(additionalHigh)}
            </p>
          </div>
          <p className="mt-3 text-xs text-slate-600">
            Demo estimates based on the controlled replay scenario. This is estimated exposure,
            not confirmed money saved.
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
