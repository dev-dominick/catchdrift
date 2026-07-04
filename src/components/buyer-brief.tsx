"use client";

import { useState } from "react";
import { useAsyncAction } from "@/hooks/useAsyncAction";

type BuyerBriefResponse = {
  brief: {
    label: string;
    mode: "ai" | "fallback";
    summary: string;
    competingInterpretations: string[];
    prioritizedSteps: string[];
    caution: string;
    reason?: string;
  };
  evidence: Record<string, unknown>;
};

export function BuyerBrief({ incidentId }: { incidentId: string }) {
  const [data, setData] = useState<BuyerBriefResponse | null>(null);
  const { error, runningKey, run, setError } = useAsyncAction();
  const loading = runningKey === "buyer-brief";

  async function loadBrief() {
    const body = await run(
      "buyer-brief",
      async () => {
      const response = await fetch(`/api/incidents/${incidentId}/buyer-brief`, {
        method: "GET",
      });

      if (!response.ok) {
        setError(`Failed to generate brief (${response.status}).`);
        return null;
      }

        return (await response.json()) as BuyerBriefResponse;
      },
      "Unable to generate brief right now. Try again.",
    );

    if (body) {
      setData(body);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">Buyer brief</h2>
        <button
          type="button"
          onClick={loadBrief}
          disabled={loading}
          className="rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {loading ? "Generating brief..." : "Generate investigation brief"}
        </button>
      </div>

      {!data && !error ? (
        <p className="mt-3 text-sm text-slate-600">
          Optional AI investigation aid generated from persisted evidence. AI may summarize findings
          and prioritize steps. AI does not create incidents, set severity, calculate exposure, or
          verify recovery.
        </p>
      ) : null}

      {error ? <p className="mt-3 text-sm text-rose-700">{error}</p> : null}

      {data ? (
        <div className="mt-4 space-y-3 text-sm text-slate-700">
          <p className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs font-medium uppercase tracking-wide text-slate-600">
            {data.brief.label}
          </p>
          <p>{data.brief.summary}</p>

          <div>
            <h3 className="font-semibold text-slate-900">Competing interpretations</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {data.brief.competingInterpretations.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-slate-900">Prioritized investigation steps</h3>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              {data.brief.prioritizedSteps.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          </div>

          <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            {data.brief.caution}
          </p>

          {data.brief.reason ? (
            <p className="text-xs text-slate-500">
              Model unavailable. Generated from persisted evidence. Reason: {data.brief.reason}
            </p>
          ) : null}

          <details className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <summary className="cursor-pointer text-sm font-medium text-slate-800">Source evidence</summary>
            <pre className="mt-3 overflow-x-auto rounded bg-slate-950 p-3 text-xs text-slate-100">
              {JSON.stringify(data.evidence, null, 2)}
            </pre>
          </details>
        </div>
      ) : null}
    </section>
  );
}
