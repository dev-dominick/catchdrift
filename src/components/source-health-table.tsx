import { PRESENTATION_COPY } from "@/lib/presentation-contract";

type SourceHealth = {
  source: string;
  expected_delay_minutes: number;
  last_successful_event_at: string | null;
  freshness_label?: string;
  overdue_minutes?: number | null;
  suppresses_decisions?: boolean;
};

const SOURCE_LABELS: Record<string, string> = {
  ads_clicks: "Ad clicks",
  attribution: "Attribution",
  deployment_feed: "Deployments",
  internal_forms: "Form submissions",
  landing_telemetry: "Landing-page sessions",
  spend_feed: "Spend",
  revenue: "Revenue",
};

function formatLastReceived(value: string | null): string {
  if (!value) {
    return "No data";
  }

  const diffMinutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60_000));
  if (diffMinutes < 1) {
    return "Just now";
  }
  if (diffMinutes < 60) {
    return `${diffMinutes} min ago`;
  }

  const diffHours = Math.round((diffMinutes / 60) * 10) / 10;
  return `${diffHours} hours ago`;
}

export function SourceHealthTable({ rows }: { rows: SourceHealth[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
        No source health records yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">Source</th>
            <th className="px-4 py-3">Last simulated event</th>
            <th className="px-4 py-3">Expected every</th>
            <th className="px-4 py-3">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.source} className="border-t border-slate-100">
              <td className="px-4 py-3 font-medium text-slate-900">
                {SOURCE_LABELS[row.source] ?? row.source}
              </td>
              <td className="px-4 py-3">{formatLastReceived(row.last_successful_event_at)}</td>
              <td className="px-4 py-3">{row.expected_delay_minutes} min</td>
              <td className="px-4 py-3">
                <div className="text-xs text-slate-600">Data mode</div>
                <div className="font-medium text-slate-900">{PRESENTATION_COPY.sourceStatusLabels.dataMode}</div>
                <div className="mt-1 text-xs text-slate-600">Simulation status</div>
                <div className="font-medium text-slate-900">
                  {!row.last_successful_event_at
                    ? PRESENTATION_COPY.sourceStatusLabels.simulationMissing
                    : row.suppresses_decisions
                      ? PRESENTATION_COPY.sourceStatusLabels.simulationStale
                      : PRESENTATION_COPY.sourceStatusLabels.simulationDataAvailable}
                </div>
                <div className="mt-1 text-xs text-slate-600">Live connector</div>
                <div className="font-medium text-slate-900">{PRESENTATION_COPY.sourceStatusLabels.liveConnectorNotConfigured}</div>
                {typeof row.overdue_minutes === "number" && row.overdue_minutes > 0 ? (
                  <div className="text-xs text-slate-600">{row.overdue_minutes} min overdue</div>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
