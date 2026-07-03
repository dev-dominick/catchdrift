"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

type SimulationState = "idle" | "running" | "incident" | "completed" | "error";

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
  "healthy",
  "deployment",
  "degradation",
  "incident_detected",
  "corrective_deployment",
  "recovery_verified",
];

const STAGE_LABEL_BY_KEY: Record<string, string> = {
  healthy: "Campaign healthy",
  deployment: "A landing-page change just went live",
  degradation: "Traffic is arriving, but attribution is falling",
  incident_detected: "Tracking may have broken after deployment v42",
  corrective_deployment: "Tracking fix deployed as v43",
  recovery_verified: "Recovery verified",
};

export function SimulationControls() {
  const [state, setState] = useState<SimulationState>("idle");
  const [lines, setLines] = useState<string[]>([]);
  const [stageKey, setStageKey] = useState<string>("healthy");
  const [statusMessage, setStatusMessage] = useState<string>(
    "Start replay to run the incident from healthy campaign through verified recovery.",
  );
  const [incidentUrl, setIncidentUrl] = useState<string | null>(null);
  const pollSessionRef = useRef(0);

  const running = useMemo(() => state === "running", [state]);

  useEffect(() => {
    return () => {
      pollSessionRef.current += 1;
    };
  }, []);

  async function runSimulation() {
    if (running) {
      return;
    }

    pollSessionRef.current += 1;
    const currentPollSession = pollSessionRef.current;

    setState("running");
    setLines([]);
    setStageKey("healthy");
    setIncidentUrl(null);
    setStatusMessage("Starting replay...");

    const response = await fetch("/api/demo/replay", {
      method: "POST",
    });

    if (response.status !== 202) {
      const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      const message = body?.error?.message ?? `Replay failed to start (${response.status}).`;
      if (pollSessionRef.current !== currentPollSession) {
        return;
      }
      setLines([message]);
      setStatusMessage(message);
      setState("error");
      return;
    }

    const payload = (await response.json()) as { runId: string };
    const runId = payload.runId;

    while (true) {
      if (pollSessionRef.current !== currentPollSession) {
        return;
      }

      const statusResponse = await fetch(`/api/demo/runs/${runId}`, {
        method: "GET",
        cache: "no-store",
      });

      if (!statusResponse.ok) {
        if (pollSessionRef.current !== currentPollSession) {
          return;
        }
        setState("error");
        setStatusMessage(`Unable to fetch replay status (${statusResponse.status}).`);
        return;
      }

      const run = (await statusResponse.json()) as ReplayRunStatus;

      if (pollSessionRef.current !== currentPollSession) {
        return;
      }

      setLines(run.lines);
      const currentStage = STAGE_LABEL_BY_KEY[run.stage.key] ? run.stage.key : "healthy";
      setStageKey(currentStage);
      setStatusMessage(STAGE_LABEL_BY_KEY[currentStage] ?? run.stage.label);

      if (run.incidentUrl) {
        setIncidentUrl(run.incidentUrl);
        if (run.status !== "completed" && run.stage.key !== "recovery_verified") {
          setState("incident");
        }
      }

      if (run.status === "failed") {
        const safeMessage = run.publicMessage ?? "Replay failed before completion.";
        const reference = run.publicReference ? ` Reference: ${run.publicReference}.` : "";
        setState("error");
        setStatusMessage(`${safeMessage}${reference}`.trim());
        return;
      }

      if (run.stage.key === "recovery_verified" && run.incidentUrl) {
        setState("completed");
        setStageKey("recovery_verified");
        setStatusMessage("Tracking recovered after deployment v43.");
      }

      if (run.status === "completed") {
        setState("completed");
        if (run.incidentUrl) {
          setIncidentUrl(run.incidentUrl);
        }
        setStageKey("recovery_verified");
        setStatusMessage("Tracking recovered after deployment v43.");
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 700));
    }
  }

  function stageWorkspaceContent() {
    if (stageKey === "deployment") {
      return {
        heading: "A landing-page change just went live",
        body: "redirectUrl",
        detail: "/apply?click_id={{click_id}} -> /apply",
      };
    }

    if (stageKey === "degradation") {
      return {
        heading: "Traffic is arriving, but attribution is falling",
        bullets: [
          "Spend remains active",
          "Click-to-session loss increased to 18.1%",
          "Attribution rate fell to 75.0%",
          "Degraded intervals: 3 of 3",
        ],
      };
    }

    if (stageKey === "incident_detected") {
      return {
        heading: "Tracking may have broken after deployment v42",
        body: "The release removed the click ID from the landing-page redirect.",
        detail: "Estimated exposure at the current rate: $230-$310/hour",
      };
    }

    if (stageKey === "corrective_deployment") {
      return {
        heading: "Corrective deployment v43 is live",
        body: "Click-ID forwarding was restored for the redirect path.",
      };
    }

    if (stageKey === "recovery_verified") {
      return {
        heading: "Tracking recovered after deployment v43",
        body: "Metrics returned near their previous range for three consecutive intervals.",
      };
    }

    return {
      heading: "Campaign 211",
      body: "Everything looks normal.",
      bullets: [
        "Spend: $900/hour",
        "Click-to-session loss: 3.9%",
        "Attribution rate: 95.2%",
      ],
    };
  }

  const workspace = stageWorkspaceContent();
  const progressLabel = STAGE_LABEL_BY_KEY[stageKey] ?? "Replay running";

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        {state === "idle" || state === "error" ? (
          <button
            type="button"
            disabled={running}
            onClick={runSimulation}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Start replay
          </button>
        ) : null}

        {state === "running" ? (
          <button
            type="button"
            disabled
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white opacity-60"
          >
            {progressLabel}
          </button>
        ) : null}

        {state === "incident" && incidentUrl ? (
          <>
            <Link
              href={incidentUrl}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
            >
              Open incident
            </Link>
            <button
              type="button"
              onClick={runSimulation}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
            >
              Run again
            </button>
          </>
        ) : null}

        {state === "completed" && incidentUrl ? (
          <>
            <Link
              href={incidentUrl}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
            >
              Open recovered incident
            </Link>
            <button
              type="button"
              onClick={runSimulation}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
            >
              Run again
            </button>
          </>
        ) : null}
      </div>

      <p className="mt-3 text-sm text-slate-700">{statusMessage}</p>

      <article className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4" aria-live="polite">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Replay workspace</p>
        <h3 className="mt-1 text-lg font-semibold text-slate-900">{workspace.heading}</h3>
        {workspace.body ? <p className="mt-2 text-sm text-slate-700">{workspace.body}</p> : null}
        {workspace.detail ? (
          <pre className="mt-3 overflow-x-auto rounded-md bg-white p-3 text-sm text-slate-900">
            {workspace.detail}
          </pre>
        ) : null}
        {workspace.bullets ? (
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">
            {workspace.bullets.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : null}
      </article>

      <ol className="mt-4 flex flex-wrap gap-2 text-xs text-slate-600" aria-label="Replay stages">
        {STAGES.map((key) => {
          const active = key === stageKey;
          return (
            <li
              key={key}
              className={`rounded-full border px-2 py-1 ${
                active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white"
              }`}
            >
              {STAGE_LABEL_BY_KEY[key]}
            </li>
          );
        })}
      </ol>

      <div className="mt-4 rounded-md bg-slate-950 p-3 text-xs text-slate-100">
        {lines.length === 0 ? (
          <p className="text-slate-400">Replay log appears here once the run starts.</p>
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
