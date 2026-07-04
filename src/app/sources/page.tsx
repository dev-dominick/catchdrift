import { SourceHealthTable } from "@/components/source-health-table";
import { listSourceHealth } from "@/domain/engine";

export const dynamic = "force-dynamic";

export default async function SourcesPage() {
  const rows = await listSourceHealth();
  const suppressed = rows.some((row) => Boolean(row.suppresses_decisions));

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Demo environment and connectors</h1>
        <p className="mt-2 text-sm text-slate-600">
          The public demo runs on deterministic replay data. Production connectors are shown separately so
          disconnected demo sources do not read as failed integrations.
        </p>
      </header>

      <div className="mb-4 grid gap-3 md:grid-cols-2">
        <section className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          <p className="font-semibold">Demo environment</p>
          <p className="mt-1">Data mode: deterministic replay. Historical evidence remains available after the controlled dataset stops advancing.</p>
        </section>
        <section className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800">
          <p className="font-semibold">Production connectors</p>
          <p className="mt-1">Ad-platform, analytics, deployment, and affiliate-provider feeds are intentionally not attached to this public demo.</p>
        </section>
      </div>

      {suppressed ? (
        <p className="mb-4 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          Replay data is no longer advancing, so new simulated incidents are suppressed until the demo
          refreshes source evidence. Existing replay evidence remains available below.
        </p>
      ) : null}

      <details className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <summary className="cursor-pointer text-sm font-semibold text-slate-900">View technical source details</summary>
        <div className="mt-4">
          <SourceHealthTable rows={rows as never[]} />
        </div>
      </details>
    </div>
  );
}
