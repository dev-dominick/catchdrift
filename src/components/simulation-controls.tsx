"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DEMO_STORY } from "@/lib/constants";
import { formatMoneyMinor } from "@/lib/format";

type SimulationState = "idle" | "running" | "incident" | "completed" | "error";
type StoryStageKey =
  | "healthy"
  | "signal_degrading"
  | "waiting_confirmation"
  | "incident_confirmed"
  | "deployment_identified"
  | "spend_at_risk"
  | "tracking_restored"
  | "recovery_verified";

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

const STORY_STAGES: Array<{ key: StoryStageKey; title: string; detail: string }> = [
  {
    key: "healthy",
    title: "Campaign healthy",
    detail: "Spend, clicks, sessions, and attributed conversions are in expected range.",
  },
  {
    key: "signal_degrading",
    title: "Tracking signal begins degrading",
    detail: "Traffic is still flowing, but session and attributed conversion signals diverge.",
  },
  {
    key: "waiting_confirmation",
    title: "CatchDrift waits for confirmation",
    detail: "One bad interval is not enough. CatchDrift waits for sustained degradation.",
  },
  {
    key: "incident_confirmed",
    title: "Incident confirmed",
    detail: "Threshold and persistence conditions are met. Incident is created with evidence.",
  },
  {
    key: "deployment_identified",
    title: "Recent deployment identified",
    detail: "Deployment abc123 is the strongest correlated operational change.",
  },
  {
    key: "spend_at_risk",
    title: `${formatMoneyMinor(DEMO_STORY.estimatedExposureMinor)} of spend now at risk`,
    detail: `If untreated, this pattern represents up to ${formatMoneyMinor(DEMO_STORY.potentialDailyExposureMinor)} in daily exposed spend.`,
  },
  {
    key: "tracking_restored",
    title: "Tracking restored",
    detail: "A corrective release restores click_id forwarding on landing-page redirect.",
  },
  {
    key: "recovery_verified",
    title: "Recovery verified",
    detail: "Signals returned to expected range for three consecutive evaluation windows.",
  },
];

const STAGE_INDEX_BY_KEY = Object.fromEntries(STORY_STAGES.map((stage, index) => [stage.key, index])) as Record<
  StoryStageKey,
  number
>;

const TIMELINE_SERIES = [
  { t: "12:00", spend: 640, clicks: 1010, sessions: 984, conversions: 91 },
  { t: "12:05", spend: 640, clicks: 1002, sessions: 978, conversions: 90 },
  { t: "12:10", spend: 640, clicks: 1007, sessions: 972, conversions: 88 },
  { t: "12:15", spend: 640, clicks: 1003, sessions: 805, conversions: 54 },
  { t: "12:20", spend: 640, clicks: 1005, sessions: 744, conversions: 36 },
  { t: "12:25", spend: 640, clicks: 1004, sessions: 732, conversions: 28 },
  { t: "12:30", spend: 640, clicks: 1002, sessions: 746, conversions: 34 },
  { t: "12:35", spend: 640, clicks: 1006, sessions: 896, conversions: 71 },
  { t: "12:40", spend: 640, clicks: 1001, sessions: 953, conversions: 86 },
  { t: "12:45", spend: 640, clicks: 1003, sessions: 972, conversions: 90 },
];

const TIMELINE_MARKERS = [
  { at: "12:15", label: "Deployment" },
  { at: "12:25", label: "Incident detected" },
  { at: "12:30", label: "Fix applied" },
  { at: "12:40", label: "Recovery verified" },
];

function deriveStoryStage(run: ReplayRunStatus): StoryStageKey {
  const allLines = run.lines.join("\n");

  if (run.status === "completed" || run.stage.key === "recovery_verified" || allLines.includes("✓ Campaign recovered")) {
    return "recovery_verified";
  }

  if (allLines.includes("✓ Deployment v43 recorded") || allLines.includes("✓ Recovery intervals ingested")) {
    return "tracking_restored";
  }

  if (allLines.includes("✓ Exposure calculated at")) {
    return "spend_at_risk";
  }

  if (allLines.includes("✓ Deployment v42 correlated")) {
    return "deployment_identified";
  }

  if (run.incidentId || run.incidentUrl || allLines.includes("✓ Incident persisted") || allLines.includes("INCIDENT_ID:")) {
    return "incident_confirmed";
  }

  if (allLines.includes("✓ Second degraded interval matured")) {
    return "waiting_confirmation";
  }

  if (allLines.includes("✓ First degraded interval matured") || run.stage.key === "degradation") {
    return "signal_degrading";
  }

  return "healthy";
}

export function SimulationControls() {
  const [state, setState] = useState<SimulationState>("idle");
  const [lines, setLines] = useState<string[]>([]);
  const [stageKey, setStageKey] = useState<StoryStageKey>("healthy");
  const [statusMessage, setStatusMessage] = useState<string>(
    "Run live incident simulation to see CatchDrift detect, explain, and verify recovery.",
  );
  const [paused, setPaused] = useState(false);
  const [incidentUrl, setIncidentUrl] = useState<string | null>(null);
  const pollSessionRef = useRef(0);
  const pausedRef = useRef(false);
  const bufferedRunRef = useRef<ReplayRunStatus | null>(null);
  const stageFocusRef = useRef<HTMLDivElement | null>(null);

  const running = useMemo(() => state === "running", [state]);
  const activeStageIndex = STAGE_INDEX_BY_KEY[stageKey] + 1;
  const progressPercent = (activeStageIndex / STORY_STAGES.length) * 100;

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    stageFocusRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [stageKey]);

  useEffect(() => {
    return () => {
      pollSessionRef.current += 1;
    };
  }, []);

  function applyRunSnapshot(run: ReplayRunStatus) {
    setLines(run.lines);

    const nextStage = deriveStoryStage(run);
    const stageData = STORY_STAGES[STAGE_INDEX_BY_KEY[nextStage]];
    setStageKey(nextStage);
    setStatusMessage(stageData.detail);

    if (run.incidentUrl) {
      setIncidentUrl(run.incidentUrl);
      if (run.status !== "completed") {
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

    if (run.status === "completed") {
      setState("completed");
      setStageKey("recovery_verified");
      setStatusMessage(STORY_STAGES[STAGE_INDEX_BY_KEY.recovery_verified].detail);
    }
  }

  async function runSimulation() {
    if (running) {
      return;
    }

    pollSessionRef.current += 1;
    const currentPollSession = pollSessionRef.current;

    setState("running");
    setPaused(false);
    setLines([]);
    setStageKey("healthy");
    setIncidentUrl(null);
    bufferedRunRef.current = null;
    setStatusMessage(STORY_STAGES[0].detail);

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

      if (pausedRef.current) {
        bufferedRunRef.current = run;
      } else {
        applyRunSnapshot(run);
      }

      if (run.status === "completed" || run.status === "failed") {
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 700));
    }
  }

  function togglePause() {
    const next = !paused;
    setPaused(next);

    if (!next && bufferedRunRef.current) {
      applyRunSnapshot(bufferedRunRef.current);
      bufferedRunRef.current = null;
    }
  }

  const stage = STORY_STAGES[STAGE_INDEX_BY_KEY[stageKey]];
  const showExecutiveBrief =
    stageKey === "incident_confirmed" ||
    stageKey === "deployment_identified" ||
    stageKey === "spend_at_risk" ||
    stageKey === "tracking_restored" ||
    stageKey === "recovery_verified";

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard label="Spend protected" value={formatMoneyMinor(DEMO_STORY.estimatedExposureMinor)} />
        <MetricCard label="Time to detection" value={`${DEMO_STORY.detectionMinutes} min`} />
        <MetricCard label="Campaigns monitored" value={String(DEMO_STORY.campaignsMonitored)} />
        <MetricCard label="Estimated loss avoided" value={formatMoneyMinor(DEMO_STORY.estimatedExposureMinor)} />
        <MetricCard label="Incident cause" value="Deployment abc123" />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {state === "idle" || state === "error" ? (
          <button
            type="button"
            disabled={running}
            onClick={runSimulation}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Run live incident simulation
          </button>
        ) : null}

        {(state === "running" || state === "incident") && (
          <button
            type="button"
            onClick={togglePause}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
          >
            {paused ? "Resume" : "Pause"}
          </button>
        )}

        {(state === "running" || state === "incident" || state === "completed" || state === "error") && (
          <button
            type="button"
            onClick={runSimulation}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
          >
            Restart simulation
          </button>
        )}

        {incidentUrl ? (
          <Link href={incidentUrl} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
            View full evidence
          </Link>
        ) : null}
      </div>

      <div ref={stageFocusRef} className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Guided simulation</p>
        <h3 className="mt-1 text-lg font-semibold text-slate-900">{stage.title}</h3>
        <p className="mt-2 text-sm text-slate-700">{statusMessage}</p>

        <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-slate-900 transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      <ol className="mt-4 grid gap-2 text-xs text-slate-600 sm:grid-cols-2 lg:grid-cols-4" aria-label="Replay stages">
        {STORY_STAGES.map((item, index) => {
          const currentIndex = STAGE_INDEX_BY_KEY[stageKey];
          const active = item.key === stageKey;
          const complete = index < currentIndex;

          return (
            <li
              key={item.key}
              className={`rounded-md border px-3 py-2 ${
                active
                  ? "border-slate-900 bg-slate-900 text-white"
                  : complete
                    ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                    : "border-slate-300 bg-white"
              }`}
            >
              <span className="font-semibold">{index + 1}.</span> {item.title}
            </li>
          );
        })}
      </ol>

      <section className="mt-6 rounded-xl border border-slate-200 p-4">
        <h3 className="text-base font-semibold text-slate-900">Before and after incident timeline</h3>
        <p className="mt-1 text-sm text-slate-600">
          Spend and clicks stay steady while sessions and conversions collapse immediately after
          deployment, then recover after the fix.
        </p>
        <div className="mt-3 h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={TIMELINE_SERIES}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="t" />
              <YAxis yAxisId="volume" />
              <YAxis yAxisId="spend" orientation="right" domain={[500, 700]} />
              <Tooltip />
              <Legend />
              {TIMELINE_MARKERS.map((marker) => (
                <ReferenceLine
                  key={marker.label}
                  x={marker.at}
                  stroke="#475569"
                  strokeDasharray="4 4"
                  label={{ value: marker.label, position: "insideTop", fill: "#334155", fontSize: 11 }}
                />
              ))}
              <Line yAxisId="spend" type="monotone" dataKey="spend" stroke="#111827" dot={false} />
              <Line yAxisId="volume" type="monotone" dataKey="clicks" stroke="#2563eb" dot={false} />
              <Line yAxisId="volume" type="monotone" dataKey="sessions" stroke="#dc2626" dot={false} />
              <Line yAxisId="volume" type="monotone" dataKey="conversions" stroke="#7c3aed" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      {showExecutiveBrief ? (
        <section className="mt-6 rounded-xl border border-rose-200 bg-rose-50 p-4">
          <h3 className="text-base font-semibold text-rose-900">Executive incident brief</h3>
          <p className="mt-2 text-sm text-rose-900">
            CatchDrift detected a likely attribution failure affecting the Meta Prospecting campaign.
            Spend and clicks remained normal, but attributed sessions dropped 82% following
            deployment abc123. Estimated spend currently exposed: {formatMoneyMinor(DEMO_STORY.estimatedExposureMinor)}.
            Recommended action: verify the landing-page tracking script introduced by deployment abc123.
          </p>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <BriefBlock
              title="Why we believe this"
              body="The degradation persisted for three windows, exceeded click-loss and attribution thresholds, and aligned with a deployment touching redirect behavior."
            />
            <BriefBlock
              title="Evidence"
              body="Spend and clicks stable. Sessions and attributed conversions dropped sharply after deployment. Correlation score ranked deployment abc123 highest."
            />
            <BriefBlock
              title="Recommended investigation"
              body="Check click_id forwarding, landing-page tracking script load order, and redirect query parameter handling in deployment abc123."
            />
            <BriefBlock
              title="What CatchDrift intentionally did not automate"
              body="CatchDrift did not pause campaigns, alter attribution logic, or auto-rollback deployments. It surfaced evidence and decision context only."
            />
          </div>
        </section>
      ) : null}

      {state === "completed" ? (
        <section className="mt-6 rounded-xl border border-emerald-300 bg-emerald-50 p-4">
          <h3 className="text-lg font-semibold text-emerald-900">Incident resolved</h3>
          <p className="mt-2 text-sm text-emerald-900">
            CatchDrift verified that session and conversion signals returned to expected range for
            three consecutive evaluation windows.
          </p>
          <ul className="mt-3 space-y-1 text-sm text-emerald-900">
            <li>Estimated exposure limited: {formatMoneyMinor(DEMO_STORY.estimatedExposureMinor)}</li>
            <li>Potential daily exposure: {formatMoneyMinor(DEMO_STORY.potentialDailyExposureMinor)}</li>
            <li>Detection time: {DEMO_STORY.detectionMinutes} minutes</li>
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            {incidentUrl ? (
              <Link href={incidentUrl} className="rounded-md bg-emerald-900 px-3 py-2 text-sm font-semibold text-white">
                View full evidence
              </Link>
            ) : null}
            <button
              type="button"
              onClick={runSimulation}
              className="rounded-md border border-emerald-700 px-3 py-2 text-sm font-semibold text-emerald-900"
            >
              Restart simulation
            </button>
            <Link href="/architecture" className="rounded-md border border-emerald-700 px-3 py-2 text-sm font-semibold text-emerald-900">
              Explore architecture
            </Link>
          </div>
        </section>
      ) : null}

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

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-base font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function BriefBlock({ title, body }: { title: string; body: string }) {
  return (
    <article className="rounded-lg border border-rose-200 bg-white p-3">
      <h4 className="text-sm font-semibold text-slate-900">{title}</h4>
      <p className="mt-1 text-sm text-slate-700">{body}</p>
    </article>
  );
}
