import { SourceHealthTable } from "@/components/source-health-table";
import { listSourceHealth } from "@/domain/engine";

export const dynamic = "force-dynamic";

export default async function SourcesPage() {
  const rows = await listSourceHealth();
  const suppressed = rows.some((row) => Boolean(row.suppresses_decisions));

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Integration status</h1>
        <p className="mt-2 text-sm text-slate-600">
          Simulation evidence and live integration readiness are separated below.
        </p>
      </header>

      <div className="mb-4 grid gap-3 md:grid-cols-2">
        <section className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          <p className="font-semibold">Simulation environment</p>
          <p className="mt-1">Completed successfully. Historical simulation evidence remains available after the controlled dataset stops advancing.</p>
        </section>
        <section className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800">
          <p className="font-semibold">Live integrations</p>
          <p className="mt-1">Not connected in this demonstration. Ad-platform, analytics, deployment, and affiliate-provider feeds are outside this controlled environment.</p>
        </section>
      </div>

      {suppressed ? (
        <p className="mb-4 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          Detection paused. Required live sources are stale, so new incidents are suppressed
          until fresh data returns.
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
