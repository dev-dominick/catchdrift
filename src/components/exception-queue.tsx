import Link from "next/link";
import { exposureLabel, formatMoneyMinor } from "@/lib/format";
import { DEMO_SCENARIO } from "@/lib/constants";

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

const groupOrder: Array<{ key: string; label: string }> = [
  { key: "detected", label: "Active" },
  { key: "investigating", label: "Investigating" },
  { key: "recovered", label: "Recovered" },
  { key: "resolved", label: "Resolved" },
];

export function ExceptionQueue({ incidents }: { incidents: ExceptionItem[] }) {
  if (incidents.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
        <p className="font-medium text-slate-900">Campaign state is currently healthy.</p>
        <p className="mt-2">
          No actionable incidents are open. Run the incident simulation to demonstrate deployment-aware
          detection, exposure estimation, and recovery verification.
        </p>
        <Link
          href="/"
          className="mt-4 inline-flex rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white"
        >
          Run incident simulation
        </Link>
      </div>
    );
  }

  const grouped = new Map<string, ExceptionItem[]>();
  for (const group of groupOrder) {
    grouped.set(group.key, []);
  }

  for (const incident of incidents) {
    const key = incident.status === "acknowledged" ? "investigating" : incident.status;
    const target = grouped.get(key);
    if (target) {
      target.push(incident);
    }
  }

  return (
    <div className="space-y-4">
      {groupOrder.map((group) => {
        const items = grouped.get(group.key) ?? [];

        return (
          <section key={group.key} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">{group.label}</h3>
              <span className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                {items.length}
              </span>
            </div>

            {items.length === 0 ? (
              <p className="text-sm text-slate-500">No incidents in this state.</p>
            ) : (
              <ul className="space-y-3">
                {items.map((incident) => {
                  const statusLabel = incident.status === "acknowledged" ? "investigating" : incident.status;

                  return (
                    <li key={incident.id} className="rounded-lg border border-slate-200 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded px-2 py-1 text-xs font-semibold ${severityClass[incident.severity]}`}>
                          {incident.severity} severity
                        </span>
                        <span className="text-xs uppercase tracking-wide text-slate-500">{statusLabel} status</span>
                      </div>

                      <p className="mt-2 text-sm font-semibold text-slate-900">{DEMO_SCENARIO.incidentTitle}</p>
                      <p className="mt-1 text-sm text-slate-700">
                        {incident.campaign_name} · {DEMO_SCENARIO.trafficSource}
                      </p>
                      <p className="mt-1 text-sm text-slate-700">
                        {formatMoneyMinor(DEMO_SCENARIO.exposureAtDetectionMinor)} exposed before recovery
                      </p>
                      <p className="mt-1 text-sm text-slate-700">Likely cause: {DEMO_SCENARIO.rootCauseSummary}</p>
                      <p className="mt-1 text-sm text-slate-700">
                        Exposure rate: {exposureLabel(incident.exposure_low_minor, incident.exposure_high_minor, incident.currency)}
                      </p>

                      <Link href={`/incidents/${incident.id}`} className="mt-2 inline-block text-sm font-medium text-slate-800 underline">
                        View evidence
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
