type SourceHealth = {
  source: string;
  expected_delay_minutes: number;
  last_successful_event_at: string | null;
  latest_mature_interval_end: string | null;
  freshness_state: string;
  connector_state: string;
};

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
            <th className="px-4 py-3">Last successful event</th>
            <th className="px-4 py-3">Expected delay</th>
            <th className="px-4 py-3">Latest mature interval</th>
            <th className="px-4 py-3">Freshness</th>
            <th className="px-4 py-3">Connector state</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.source} className="border-t border-slate-100">
              <td className="px-4 py-3 font-medium text-slate-900">{row.source}</td>
              <td className="px-4 py-3">
                {row.last_successful_event_at
                  ? new Date(row.last_successful_event_at).toLocaleString()
                  : "-"}
              </td>
              <td className="px-4 py-3">{row.expected_delay_minutes} min</td>
              <td className="px-4 py-3">
                {row.latest_mature_interval_end
                  ? new Date(row.latest_mature_interval_end).toLocaleString()
                  : "-"}
              </td>
              <td className="px-4 py-3 capitalize">{row.freshness_state}</td>
              <td className="px-4 py-3 capitalize">{row.connector_state}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
