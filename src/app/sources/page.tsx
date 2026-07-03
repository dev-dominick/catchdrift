import { SourceHealthTable } from "@/components/source-health-table";
import { listSourceHealth } from "@/domain/engine";

export const dynamic = "force-dynamic";

export default async function SourcesPage() {
  const rows = await listSourceHealth();
  const suppressed = rows.some((row) => Boolean(row.suppresses_decisions));

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Data health</h1>
        <p className="mt-2 text-sm text-slate-600">
          Source freshness determines whether new incidents can be evaluated.
        </p>
      </header>

      {suppressed ? (
        <p className="mb-4 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          Detection paused. CatchDrift is waiting for fresh campaign data. Existing incidents
          remain available, but no new incidents will be created until required sources recover.
        </p>
      ) : null}

      <SourceHealthTable rows={rows as never[]} />
    </div>
  );
}
