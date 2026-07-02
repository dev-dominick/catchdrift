import { notFound } from "next/navigation";
import { EvidenceTimeline } from "@/components/evidence-timeline";
import { IncidentActions } from "@/components/incident-actions";
import { getIncident } from "@/domain/engine";
import { exposureLabel } from "@/lib/format";

export const dynamic = "force-dynamic";

type Params = {
  incidentId: string;
};

export default async function IncidentDetailPage({ params }: { params: Promise<Params> }) {
  const { incidentId } = await params;
  const data = await getIncident(incidentId);

  if (!data) {
    notFound();
  }

  const { incident, evidence, events, timeline } = data;
  const exposure = evidence.find((item) => String(item.evidence_type) === "exposure")?.evidence_json as
    | Record<string, unknown>
    | undefined;
  const baseline = evidence.find((item) => String(item.evidence_type) === "baseline")?.evidence_json as
    | Record<string, unknown>
    | undefined;
  const deployment = evidence.find((item) => String(item.evidence_type) === "deployment")?.evidence_json as
    | Record<string, unknown>
    | undefined;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Incident detail</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">{String(incident.rule_id)}@{String(incident.rule_version)}</h1>
        <p className="mt-1 text-sm text-slate-700">{String(incident.campaign_name)}</p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Info label="Severity" value={String(incident.severity)} />
          <Info label="Confidence" value={String(incident.confidence)} />
          <Info label="Status" value={String(incident.status)} />
          <Info
            label="Estimated exposure"
            value={exposureLabel(
              incident.exposure_low_minor == null ? null : Number(incident.exposure_low_minor),
              incident.exposure_high_minor == null ? null : Number(incident.exposure_high_minor),
              String(incident.currency),
            )}
          />
        </div>

        <div className="mt-4">
          <IncidentActions incidentId={incidentId} />
        </div>
      </header>

      <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Evidence timeline</h2>
        <p className="mt-1 text-sm text-slate-600">
          Baseline and degraded intervals are displayed with spend, revenue, click loss, and attribution rate.
        </p>
        <div className="mt-4">
          <EvidenceTimeline rows={timeline as never[]} />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Observed facts</h2>
          <pre className="mt-3 overflow-x-auto rounded bg-slate-950 p-3 text-xs text-slate-100">
            {JSON.stringify(baseline, null, 2)}
          </pre>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Deployment candidate and score</h2>
          <pre className="mt-3 overflow-x-auto rounded bg-slate-950 p-3 text-xs text-slate-100">
            {JSON.stringify(deployment, null, 2)}
          </pre>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
          <h2 className="text-lg font-semibold text-slate-900">Exposure calculation breakdown</h2>
          <pre className="mt-3 overflow-x-auto rounded bg-slate-950 p-3 text-xs text-slate-100">
            {JSON.stringify(exposure, null, 2)}
          </pre>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
          <h2 className="text-lg font-semibold text-slate-900">Incident event history</h2>
          <ul className="mt-3 space-y-2 text-sm text-slate-700">
            {events.map((event, index) => (
              <li key={`${String(event.event_type)}-${index}`} className="rounded border border-slate-200 p-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium capitalize">{String(event.event_type)}</span>
                  <span className="text-xs text-slate-500">
                    {new Date(String(event.created_at)).toLocaleString()}
                  </span>
                </div>
                <pre className="mt-2 overflow-x-auto rounded bg-slate-50 p-2 text-xs text-slate-700">
                  {JSON.stringify(event.details_json, null, 2)}
                </pre>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900 capitalize">{value}</p>
    </div>
  );
}
