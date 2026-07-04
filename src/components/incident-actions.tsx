"use client";

import { useState } from "react";

type IncidentStatus = "detected" | "acknowledged" | "investigating" | "recovered" | "resolved" | "dismissed";

function actionsForStatus(status: IncidentStatus) {
  if (status === "detected" || status === "acknowledged") {
    return [
      { label: "Start investigation", value: "investigate" },
      { label: "Mark resolved", value: "resolve" },
    ] as const;
  }

  if (status === "investigating" || status === "recovered") {
    return [{ label: "Mark resolved", value: "resolve" }] as const;
  }

  return [] as const;
}

export function IncidentActions({ incidentId, status }: { incidentId: string; status: string }) {
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const normalized = (status.toLowerCase() as IncidentStatus) || "detected";
  const actions = actionsForStatus(normalized);

  async function triggerAction(action: string) {
    setError(null);
    setRunning(action);
    try {
      const response = await fetch(`/api/incidents/${incidentId}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ action }),
      });

      if (!response.ok) {
        setError(`Action failed (${response.status}).`);
        return;
      }

      window.location.reload();
    } catch {
      setError("Action failed. Try again.");
    } finally {
      setRunning(null);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((action) => (
        <button
          key={action.value}
          type="button"
          onClick={() => triggerAction(action.value)}
          disabled={Boolean(running)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
        >
          {running === action.value ? "Applying..." : action.label}
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
