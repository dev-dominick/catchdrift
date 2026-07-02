import { SourceHealthTable } from "@/components/source-health-table";
import { listSourceHealth } from "@/domain/engine";

export const dynamic = "force-dynamic";

export default async function SourcesPage() {
  const rows = await listSourceHealth();

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Source Health</h1>
        <p className="mt-2 text-sm text-slate-600">
          Performance evaluation is suppressed when required sources are stale to avoid misleading incidents.
        </p>
      </header>

      <SourceHealthTable rows={rows as never[]} />

      <p className="mt-4 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
        Revenue source stale behavior: &quot;Revenue source is stale. Performance evaluation is suspended to avoid generating a misleading incident.&quot;
      </p>
    </div>
  );
}
