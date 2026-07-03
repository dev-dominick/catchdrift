import Link from "next/link";
import { exposureLabel } from "@/lib/format";

type ExceptionItem = {
  id: string;
  severity: string;
  confidence: string;
  status: string;
  detected_at: string;
  exposure_low_minor: number | null;
  exposure_high_minor: number | null;
  currency: string;
  campaign_name: string;
  rule_id: string;
};

const severityClass: Record<string, string> = {
  critical: "bg-rose-100 text-rose-800",
  high: "bg-orange-100 text-orange-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-slate-100 text-slate-700",
};

export function ExceptionQueue({ incidents }: { incidents: ExceptionItem[] }) {
  if (incidents.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
        <p className="font-medium text-slate-900">Campaign state is currently healthy.</p>
        <p className="mt-2">
          No actionable incidents are open. Run the failure simulation to demonstrate deployment-aware
          detection, exposure estimation, and recovery verification.
        </p>
        <Link
          href="/"
          className="mt-4 inline-flex rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white"
        >
          Run failure simulation
        </Link>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">Severity</th>
            <th className="px-4 py-3">Campaign</th>
            <th className="px-4 py-3">Incident</th>
            <th className="px-4 py-3">Exposure</th>
            <th className="px-4 py-3">Confidence</th>
            <th className="px-4 py-3">Detected</th>
            <th className="px-4 py-3">Status</th>
          </tr>
        </thead>
        <tbody>
          {incidents.map((incident) => (
            <tr key={incident.id} className="border-t border-slate-100">
              <td className="px-4 py-3">
                <span className={`rounded px-2 py-1 text-xs font-semibold ${severityClass[incident.severity]}`}>
                  {incident.severity}
                </span>
              </td>
              <td className="px-4 py-3 font-medium text-slate-900">{incident.campaign_name}</td>
              <td className="px-4 py-3">
                <Link href={`/incidents/${incident.id}`} className="text-slate-800 underline">
                  {incident.rule_id}@1
                </Link>
              </td>
              <td className="px-4 py-3 font-semibold text-slate-900">
                {exposureLabel(
                  incident.exposure_low_minor,
                  incident.exposure_high_minor,
                  incident.currency,
                )}
              </td>
              <td className="px-4 py-3 capitalize">{incident.confidence}</td>
              <td className="px-4 py-3">{new Date(incident.detected_at).toLocaleString()}</td>
              <td className="px-4 py-3 capitalize">{incident.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
