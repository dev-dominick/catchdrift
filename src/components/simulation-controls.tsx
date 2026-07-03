"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type SimulationState = "idle" | "running" | "done" | "error";

export function SimulationControls() {
  const router = useRouter();
  const [state, setState] = useState<SimulationState>("idle");
  const [lines, setLines] = useState<string[]>([]);
  const [statusMessage, setStatusMessage] = useState<string>("Ready to run deterministic demo replay.");

  const running = useMemo(() => state === "running", [state]);

  async function resetDemo() {
    setState("running");
    setLines([]);
    setStatusMessage("Resetting demo workspace...");

    const response = await fetch("/api/demo/reset", {
      method: "POST",
    });

    if (!response.ok) {
      const message = `Reset failed (${response.status}). Verify the app and database are running, then retry.`;
      setLines([message]);
      setStatusMessage(message);
      setState("error");
      return;
    }

    setLines(["✓ Demo workspace reset"]);
    setStatusMessage("Demo workspace reset.");
    setState("done");
  }

  async function runSimulation() {
    setState("running");
    setLines([]);
    setStatusMessage("Running replay: healthy baseline -> deployment v42 -> degradation detection...");

    const response = await fetch("/api/demo/replay", {
      method: "POST",
    });

    if (!response.ok || !response.body) {
      const message =
        response.status === 429
          ? "Replay already running. Wait for completion and retry."
          : `Replay failed to start (${response.status}).`;
      setLines([message]);
      setStatusMessage(message);
      setState("error");
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let done = false;
    let carry = "";
    let incidentPath: string | null = null;

    while (!done) {
      const chunk = await reader.read();
      done = chunk.done;

      if (chunk.value) {
        carry += decoder.decode(chunk.value, { stream: true });
        const parts = carry.split("\n");
        carry = parts.pop() ?? "";

        for (const part of parts) {
          const trimmed = part.trim();
          if (!trimmed) {
            continue;
          }

          if (trimmed.startsWith("ERROR:")) {
            setLines((current) => [...current, trimmed]);
            setStatusMessage(trimmed);
            setState("error");
            return;
          }

          if (trimmed.startsWith("INCIDENT_URL:")) {
            incidentPath = trimmed.replace("INCIDENT_URL:", "").trim();
            continue;
          }

          if (!trimmed.startsWith("INCIDENT_ID:")) {
            setLines((current) => [...current, trimmed]);
          }
        }
      }
    }

    if (carry.trim().length > 0) {
      const trimmed = carry.trim();
      if (!trimmed.startsWith("INCIDENT_URL:") && !trimmed.startsWith("INCIDENT_ID:")) {
        setLines((current) => [...current, trimmed]);
      }
    }

    setState("done");

    if (incidentPath) {
      setStatusMessage("Incident detected. Opening detail view...");
      router.push(incidentPath);
      return;
    }

    setStatusMessage("Replay completed.");
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={running}
          onClick={runSimulation}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {running ? "Running replay..." : "Run the 90-second protection demo"}
        </button>
        <button
          type="button"
          disabled={running}
          onClick={resetDemo}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
        >
          Reset demo
        </button>
        <Link href="/incidents" className="text-sm font-medium text-slate-700 underline">
          Open exception queue
        </Link>
      </div>

      <p className="mt-3 text-sm text-slate-700">{statusMessage}</p>

      <div className="mt-4 rounded-md bg-slate-950 p-3 text-xs text-slate-100">
        {lines.length === 0 ? (
          <p className="text-slate-400">No replay output yet.</p>
        ) : (
          <ul className="space-y-1">
            {lines.map((line, index) => (
              <li key={`${line}-${index}`}>{line}</li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
