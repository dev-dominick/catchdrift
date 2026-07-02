"use client";

import { useState } from "react";

const ACTIONS = [
  { label: "Acknowledge", value: "acknowledge" },
  { label: "Investigate", value: "investigate" },
  { label: "Dismiss", value: "dismiss" },
  { label: "Resolve", value: "resolve" },
] as const;

export function IncidentActions({ incidentId }: { incidentId: string }) {
  const [running, setRunning] = useState<string | null>(null);

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

  async function replayDemo() {
    setRunning("replay");
    const response = await fetch(`/api/incidents/${incidentId}/replay`, {
      method: "POST",
    });

    if (!response.ok) {
      setRunning(null);
      return;
    }

    setRunning(null);
    window.location.assign("/incidents");
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
      <button
        type="button"
        onClick={replayDemo}
        disabled={Boolean(running)}
        className="rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {running === "replay" ? "Replaying..." : "Replay Demo"}
      </button>
    </div>
  );
}
