"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type SimulationState = "idle" | "running" | "done" | "error";

type ReplayRunStatus = {
  runId: string;
  status: "running" | "completed" | "failed";
  stage: {
    key: string;
    label: string;
    index: number;
    total: number;
  };
  incidentId: string | null;
  incidentUrl: string | null;
  lines: string[];
  publicReference: string | null;
  publicMessage: string | null;
};

const STAGES = [
  "Healthy",
  "Deployment",
  "Degradation",
  "Incident detected",
  "Corrective deployment",
  "Recovery verified",
];

export function SimulationControls() {
  const router = useRouter();
  const [state, setState] = useState<SimulationState>("idle");
  const [lines, setLines] = useState<string[]>([]);
  const [statusMessage, setStatusMessage] = useState<string>("Ready to run deterministic demo replay.");
  const [activeStage, setActiveStage] = useState<number>(0);

  const running = useMemo(() => state === "running", [state]);

  async function resetDemo() {
    setState("running");
    setLines([]);
    setStatusMessage("Resetting demo workspace...");

    const response = await fetch("/api/demo/reset", {
      method: "POST",
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      const message = body?.error?.message ?? `Reset failed (${response.status}). Verify the app and database are running, then retry.`;
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
    setActiveStage(0);
    setStatusMessage("Starting replay and creating async demo run...");

    await fetch("/api/demo/replay", { method: "GET" });

    const response = await fetch("/api/demo/replay", {
      method: "POST",
    });

    if (response.status !== 202) {
      const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      const message = body?.error?.message ?? `Replay failed to start (${response.status}).`;
      setLines([message]);
      setStatusMessage(message);
      setState("error");
      return;
    }

    const payload = (await response.json()) as { runId: string };
    const runId = payload.runId;

    let navigated = false;

    while (true) {
      const statusResponse = await fetch(`/api/demo/runs/${runId}`, {
        method: "GET",
        cache: "no-store",
      });

      if (!statusResponse.ok) {
        setState("error");
        setStatusMessage(`Unable to fetch replay status (${statusResponse.status}).`);
        return;
      }

      const run = (await statusResponse.json()) as ReplayRunStatus;
      setLines(run.lines);
      setActiveStage(Math.max(0, Math.min(run.stage.index, STAGES.length)));
      setStatusMessage(`Replay stage: ${run.stage.label}`);

      if (!navigated && run.incidentUrl) {
        navigated = true;
        setStatusMessage("Incident detected. Opening detail view while replay continues in background...");
        router.push(run.incidentUrl);
      }

      if (run.status === "failed") {
        const safeMessage = run.publicMessage ?? "Replay failed before completion.";
        const reference = run.publicReference ? ` Reference: ${run.publicReference}.` : "";
        setState("error");
        setStatusMessage(`${safeMessage}${reference}`.trim());
        return;
      }

      if (run.status === "completed") {
        setState("done");
        if (!navigated && run.incidentUrl) {
          setStatusMessage("Replay completed. Opening incident detail...");
          router.push(run.incidentUrl);
          return;
        }
        setStatusMessage("Replay completed.");
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 700));
    }
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
          {running ? "Running replay..." : "Run the 25-second incident replay"}
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

      <ol className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3" aria-live="polite">
        {STAGES.map((label, index) => {
          const stepNumber = index + 1;
          const done = activeStage >= stepNumber;
          const current = activeStage === stepNumber;

          return (
            <li
              key={label}
              className={`rounded-md border px-3 py-2 text-xs ${
                current
                  ? "border-slate-900 bg-slate-900 text-white"
                  : done
                    ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                    : "border-slate-200 bg-slate-50 text-slate-700"
              }`}
            >
              <span className="mr-2 inline-block w-4 text-center" aria-hidden="true">
                {done ? "✓" : stepNumber}
              </span>
              {label}
            </li>
          );
        })}
      </ol>

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
