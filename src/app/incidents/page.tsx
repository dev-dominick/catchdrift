import { ExceptionQueue } from "@/components/exception-queue";
import { getHealthyCampaignStatus, listExceptionQueue } from "@/domain/engine";

export const dynamic = "force-dynamic";

export default async function IncidentsPage() {
  const incidents = await listExceptionQueue();
  const campaigns = await getHealthyCampaignStatus();

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Exception Queue</h1>
        <p className="mt-2 text-sm text-slate-600">
          Actionable incidents are shown first. Healthy campaigns are listed separately.
        </p>
      </header>

      <ExceptionQueue incidents={incidents as never[]} />

      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Healthy campaign status</h2>
        <ul className="mt-3 space-y-2 text-sm text-slate-700">
          {campaigns.map((campaign) => (
            <li key={String(campaign.id)} className="flex items-center justify-between">
              <span>{String(campaign.name)}</span>
              <span className="rounded bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                {String(campaign.status) === "healthy" ? "healthy" : String(campaign.status)}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
