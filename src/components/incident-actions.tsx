"use client";

import { normalizeIncidentStatus, uiActionsForIncidentStatus } from "@/domain/incident-action-matrix";
import { useAsyncAction } from "@/hooks/useAsyncAction";

export function IncidentActions({ incidentId, status }: { incidentId: string; status: string }) {
  const { error, runningKey, run, setError } = useAsyncAction();
  const normalized = normalizeIncidentStatus(status);
  const actions = uiActionsForIncidentStatus(normalized);

  async function triggerAction(action: string) {
    const success = await run(
      action,
      async () => {
      const response = await fetch(`/api/incidents/${incidentId}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ action }),
      });

      if (!response.ok) {
        setError(`Action failed (${response.status}).`);
        return false;
      }

        return true;
      },
      "Action failed. Try again.",
    );

    if (success) {
      window.location.reload();
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((action) => (
        <button
          key={action.value}
          type="button"
          onClick={() => triggerAction(action.value)}
          disabled={Boolean(runningKey)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
        >
          {runningKey === action.value ? "Applying..." : action.label}
        </button>
      ))}
      {actions.length === 0 ? (
        <p className="text-sm text-slate-600">No manual actions available for this incident state.</p>
      ) : null}

      {normalized === "recovered" ? (
        <p className="w-full text-xs text-slate-600">
          Recovery is already verified. Resolve after post-incident review is complete.
        </p>
      ) : null}

      {error ? <p className="w-full text-sm text-rose-700">{error}</p> : null}
    </div>
  );
}
