"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type SimulationState = "idle" | "running" | "done" | "error";

export function SimulationControls() {
  const [state, setState] = useState<SimulationState>("idle");
  const [lines, setLines] = useState<string[]>([]);

  const running = useMemo(() => state === "running", [state]);

  async function resetDemo() {
    setState("running");
    setLines([]);

    const response = await fetch("/api/demo/reset", {
      method: "POST",
    });

    if (!response.ok) {
      setLines(["Reset failed"]);
      setState("error");
      return;
    }

    setLines(["✓ Demo workspace reset"]);
    setState("done");
  }

  async function runSimulation() {
    setState("running");
    setLines([]);

    const response = await fetch("/api/demo/replay", {
      method: "POST",
    });

    if (!response.ok || !response.body) {
      setLines(["Simulation failed to start"]);
      setState("error");
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let done = false;
    let carry = "";

    while (!done) {
      const chunk = await reader.read();
      done = chunk.done;

      if (chunk.value) {
        carry += decoder.decode(chunk.value, { stream: true });
        const parts = carry.split("\n");
        carry = parts.pop() ?? "";

        for (const part of parts) {
          if (part.trim().length > 0) {
            setLines((current) => [...current, part]);
          }
        }
      }
    }

    if (carry.trim().length > 0) {
      setLines((current) => [...current, carry]);
    }

    setState("done");
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
          Run failure simulation
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

      <div className="mt-4 rounded-md bg-slate-950 p-3 text-xs text-slate-100">
        {lines.length === 0 ? (
          <p className="text-slate-400">No simulation output yet.</p>
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
