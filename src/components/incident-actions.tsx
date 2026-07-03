"use client";

import { useState } from "react";

const ACTIONS = [
  { label: "Start investigation", value: "investigate" },
  { label: "Mark resolved", value: "resolve" },
] as const;

export function IncidentActions({ incidentId }: { incidentId: string }) {
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function triggerAction(action: string) {
    setRunning(action);
    await fetch(`/api/incidents/${incidentId}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ action }),
    });
    setRunning(null);
    window.location.reload();
  }

  return (
    <div className="flex flex-wrap gap-2">
      {ACTIONS.map((action) => (
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
      {error ? <p className="w-full text-sm text-rose-700">{error}</p> : null}
    </div>
  );
}
