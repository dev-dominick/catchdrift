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
import { DEMO_SCENARIO } from "@/lib/constants";
import {
  REPLAY_DEMO_STATE_EVENT,
  type ReplayDemoStateEventDetail,
  RUN_DEMO_REPLAY_EVENT,
} from "@/lib/demo-replay-events";
import { formatMoneyRangeMinor } from "@/lib/format";
import {
  CANONICAL_REPLAY_TIMELINE_OFFSETS_MINUTES,
  DEFAULT_EXPOSURE_RATE_PER_HOUR_MINOR,
  exposureRangeForMinutes,
  PRESENTATION_COPY,
} from "@/lib/presentation-contract";

type SimulationState = "idle" | "running" | "incident" | "completed" | "error";
type StoryStageKey =
  | "healthy"
  | "tracking_failure_detected"
  | "deployment_identified"
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
    key: "tracking_failure_detected",
    title: "Tracking failure detected",
    detail: "Spend and clicks continue, but attributed sessions and conversions fall enough to create an incident.",
  },
  {
    key: "deployment_identified",
    title: "Relevant change identified",
    detail: `Deployment ${DEMO_SCENARIO.deploymentIdentifier} is the strongest correlated operational change. The AI brief can summarize this persisted evidence, but the score remains deterministic.`,
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

const DETECTION_DURATION_MINUTES =
  CANONICAL_REPLAY_TIMELINE_OFFSETS_MINUTES.detection - CANONICAL_REPLAY_TIMELINE_OFFSETS_MINUTES.deployment;

const EXPOSURE_BEFORE_DETECTION = exposureRangeForMinutes({
  lowPerHourMinor: DEFAULT_EXPOSURE_RATE_PER_HOUR_MINOR.low,
  highPerHourMinor: DEFAULT_EXPOSURE_RATE_PER_HOUR_MINOR.high,
  minutes: DETECTION_DURATION_MINUTES,
});
const EXPOSURE_BEFORE_DETECTION_LABEL = formatMoneyRangeMinor(
  EXPOSURE_BEFORE_DETECTION.lowMinor,
  EXPOSURE_BEFORE_DETECTION.highMinor,
);

const TIMELINE_SERIES = [
  { t: "12:00", spend: 900, clicks: 1010, sessions: 984, conversions: 91 },
  { t: "12:05", spend: 900, clicks: 1002, sessions: 978, conversions: 90 },
  { t: "12:10", spend: 900, clicks: 1007, sessions: 972, conversions: 88 },
  { t: "12:15", spend: 900, clicks: 1003, sessions: 805, conversions: 54 },
  { t: "12:20", spend: 900, clicks: 1005, sessions: 744, conversions: 36 },
  { t: "12:25", spend: 900, clicks: 1004, sessions: 732, conversions: 28 },
  { t: "12:30", spend: 900, clicks: 1002, sessions: 746, conversions: 34 },
  { t: "12:35", spend: 900, clicks: 1006, sessions: 896, conversions: 71 },
  { t: "12:40", spend: 900, clicks: 1001, sessions: 953, conversions: 86 },
  { t: "12:45", spend: 900, clicks: 1003, sessions: 972, conversions: 90 },
  { t: "12:50", spend: 900, clicks: 1002, sessions: 975, conversions: 91 },
];

const TIMELINE_MARKERS = [
  { at: "12:15", label: PRESENTATION_COPY.timelineLabels.deployment },
  { at: "12:30", label: PRESENTATION_COPY.timelineLabels.incidentDetected },
  { at: "12:35", label: PRESENTATION_COPY.timelineLabels.fixApplied },
  { at: "12:50", label: PRESENTATION_COPY.timelineLabels.recoveryVerified },
];

const EVIDENCE_EVENTS = [
  {
    step: 1,
    time: "12:15",
    title: `Deployment ${DEMO_SCENARIO.deploymentIdentifier} observed`,
    detail: "Redirect behavior changed while spend and clicks stayed active.",
  },
  {
    step: 2,
    time: "12:30",
    title: "Metric decline persisted",
    detail: `Sessions and attributed conversions stayed degraded for ${DETECTION_DURATION_MINUTES} minutes.`,
  },
  {
    step: 2,
    time: "12:30",
    title: "Incident and exposure created",
    detail: `${EXPOSURE_BEFORE_DETECTION_LABEL} exposure calculated before automated detection.`,
  },
  {
    step: 3,
    time: "12:31",
    title: "Buyer brief assembled",
    detail: "Persisted evidence becomes an investigation path, not an automated campaign action.",
  },
  {
    step: 4,
    time: "12:50",
    title: "Recovery verified",
    detail: `${DEMO_SCENARIO.recoveryWindowCount} consecutive recovery windows returned to expected range.`,
  },
] as const;

type EvidenceStatus = "pending" | "active" | "complete";

function evidenceStatusForStep(params: {
  eventStep: number;
  activeStageIndex: number;
  replayStarted: boolean;
  completed: boolean;
}): EvidenceStatus {
  if (!params.replayStarted) {
    return "pending";
  }

  if (params.completed || params.activeStageIndex > params.eventStep) {
    return "complete";
  }

  if (params.activeStageIndex === params.eventStep) {
    return "active";
  }

  return "pending";
}

function deriveStoryStage(run: ReplayRunStatus): StoryStageKey {
  const allLines = run.lines.join("\n");

  if (run.status === "completed" || run.stage.key === "recovery_verified" || allLines.includes("✓ Campaign recovered")) {
    return "recovery_verified";
  }

  if (
    allLines.includes(`✓ Deployment ${DEMO_SCENARIO.deploymentIdentifier} correlated`) ||
    allLines.includes(`✓ Deployment ${DEMO_SCENARIO.correctiveDeploymentIdentifier} recorded`) ||
    allLines.includes("✓ Recovery intervals ingested") ||
    allLines.includes("✓ Exposure during detection estimated at") ||
    allLines.includes("✓ Exposure calculated at")
  ) {
    return "deployment_identified";
  }

  if (
    run.incidentId ||
    run.incidentUrl ||
    allLines.includes("✓ Incident persisted") ||
    allLines.includes("INCIDENT_ID:") ||
    allLines.includes("✓ Second degraded interval matured") ||
    allLines.includes("✓ First degraded interval matured") ||
    run.stage.key === "degradation"
  ) {
    return "tracking_failure_detected";
  }

  return "healthy";
}

export function SimulationControls() {
  const [state, setState] = useState<SimulationState>("idle");
  const [lines, setLines] = useState<string[]>([]);
  const [stageKey, setStageKey] = useState<StoryStageKey>("healthy");
  const [statusMessage, setStatusMessage] = useState<string>(
    "Run the replay to see deterministic detection, AI-assisted investigation, and verified recovery.",
  );
  const [paused, setPaused] = useState(false);
  const [incidentUrl, setIncidentUrl] = useState<string | null>(null);
  const pollSessionRef = useRef(0);
  const pausedRef = useRef(false);
  const bufferedRunRef = useRef<ReplayRunStatus | null>(null);
  const stageFocusRef = useRef<HTMLDivElement | null>(null);

  const activeReplay = useMemo(() => state === "running" || state === "incident", [state]);
  const replayStarted = activeReplay || state === "completed" || lines.length > 0;
  const activeStageIndex = STAGE_INDEX_BY_KEY[stageKey] + 1;
  const progressWidthClass = ["w-1/4", "w-1/2", "w-3/4", "w-full"][activeStageIndex - 1] ?? "w-1/4";
  const evidenceTimeline = EVIDENCE_EVENTS.map((event) => ({
    ...event,
    status: evidenceStatusForStep({
      eventStep: event.step,
      activeStageIndex,
      replayStarted,
      completed: state === "completed",
    }),
  }));
  const eventLog = evidenceTimeline.filter((event) => event.status !== "pending");

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent<ReplayDemoStateEventDetail>(REPLAY_DEMO_STATE_EVENT, {
        detail: { active: activeReplay },
      }),
    );
  }, [activeReplay]);

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
      const safeMessage = run.publicMessage ?? "Simulation failed before completion.";
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
    if (activeReplay) {
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
      const message = body?.error?.message ?? `Simulation failed to start (${response.status}).`;
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
        setStatusMessage(`Unable to fetch simulation status (${statusResponse.status}).`);
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

  useEffect(() => {
    function handleReplayLaunch() {
      void runSimulation();
    }

    window.addEventListener(RUN_DEMO_REPLAY_EVENT, handleReplayLaunch);
    return () => window.removeEventListener(RUN_DEMO_REPLAY_EVENT, handleReplayLaunch);
  });

  function togglePause() {
    const next = !paused;
    setPaused(next);

    if (!next && bufferedRunRef.current) {
      applyRunSnapshot(bufferedRunRef.current);
      bufferedRunRef.current = null;
    }
  }

  const stage = STORY_STAGES[STAGE_INDEX_BY_KEY[stageKey]];
  const showExecutiveBrief = stageKey !== "healthy";

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="grid gap-3 md:grid-cols-[1.4fr_1fr_1fr]">
        <MetricCard
          label={PRESENTATION_COPY.exposureLabels.beforeDetection}
          value={EXPOSURE_BEFORE_DETECTION_LABEL}
          primary
        />
        <MetricCard label="Detection duration" value={`${DETECTION_DURATION_MINUTES} min`} />
        <MetricCard label="Attribution drop" value={`${DEMO_SCENARIO.attributionDeclinePercent}%`} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {state === "idle" || state === "error" ? (
          <button
            type="button"
            disabled={activeReplay}
            onClick={runSimulation}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {PRESENTATION_COPY.replayCta}
          </button>
        ) : null}

        {activeReplay && (
          <button
            type="button"
            onClick={togglePause}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
          >
            {paused ? "Resume simulation" : "Pause simulation"}
          </button>
        )}

        {(state === "completed" || state === "error") && (
          <button
            type="button"
            onClick={runSimulation}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
          >
            Restart
          </button>
        )}

        {incidentUrl ? (
          <Link href={incidentUrl} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
            View full evidence
          </Link>
        ) : null}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div ref={stageFocusRef} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Guided simulation</p>
          <h3 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
            Step {activeStageIndex} of {STORY_STAGES.length} — {stage.title}
          </h3>
          <p className="mt-2 text-sm leading-6 text-slate-700">{statusMessage}</p>

          <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200">
            <div className={`h-full rounded-full bg-slate-900 transition-all duration-500 ${progressWidthClass}`} />
          </div>
        </div>

        <aside className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">What just happened</p>
          {eventLog.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">Replay events will appear here as evidence arrives.</p>
          ) : (
            <ol className="mt-3 space-y-2">
              {eventLog.map((event) => (
                <li key={`${event.time}-${event.title}`} className="grid grid-cols-[3.25rem_1fr] gap-2 text-sm">
                  <span className="font-mono text-xs text-slate-500">{event.time}</span>
                  <span className="text-slate-800">{event.title}</span>
                </li>
              ))}
            </ol>
          )}
        </aside>
      </div>

      <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Evidence arrival</p>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {evidenceTimeline.map((event) => (
            <article
              key={`${event.time}-${event.title}`}
              className={`rounded-lg border p-3 transition-all duration-500 ${
                event.status === "complete"
                  ? "translate-y-0 border-emerald-300 bg-emerald-50 text-emerald-950"
                  : event.status === "active"
                    ? "translate-y-0 border-cyan-300 bg-cyan-50 text-slate-950 shadow-sm"
                    : "translate-y-1 border-slate-200 bg-slate-50 text-slate-400 opacity-70"
              }`}
            >
              <p className="font-mono text-[11px] font-semibold uppercase tracking-wide">{event.time}</p>
              <h4 className="mt-1 text-sm font-semibold">{event.title}</h4>
              <p className="mt-1 text-xs leading-5">{event.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <ol className="mt-4 grid gap-2 text-xs text-slate-600 sm:grid-cols-2 lg:grid-cols-4" aria-label="Simulation stages">
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

      {(stageKey === "tracking_failure_detected" || stageKey === "deployment_identified") ? (
        <section className="mt-6 rounded-xl border border-rose-300 bg-rose-50 p-4">
          <h3 className="text-lg font-semibold text-rose-900">Tracking failure confirmed</h3>
          <p className="mt-1 text-sm text-rose-900">
            Spend remains active while attributed sessions are down by {DEMO_SCENARIO.attributionDeclinePercent}%.
          </p>
          <p className="mt-2 text-base font-semibold text-rose-900">
            {EXPOSURE_BEFORE_DETECTION_LABEL} exposure before detection
          </p>
        </section>
      ) : null}

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
              <YAxis yAxisId="spend" orientation="right" domain={[800, 1000]} />
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
            Spend and clicks remained normal, but attributed sessions dropped {DEMO_SCENARIO.conversionDeclinePercent}% following
            deployment {DEMO_SCENARIO.deploymentIdentifier}. Estimated spend currently exposed before detection: {EXPOSURE_BEFORE_DETECTION_LABEL}.
            Recommended action: {DEMO_SCENARIO.recommendedAction}
          </p>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <BriefBlock
              title="Why we believe this"
              body="The degradation persisted for three windows, exceeded click-loss and attribution thresholds, and aligned with a deployment touching redirect behavior."
            />
            <BriefBlock
              title="Evidence"
              body={`Spend and clicks stable. Sessions and attributed conversions dropped sharply after deployment. Correlation score ranked deployment ${DEMO_SCENARIO.deploymentIdentifier} highest.`}
            />
            <BriefBlock
              title="Recommended investigation"
              body={DEMO_SCENARIO.recommendedAction}
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
          <h3 className="text-lg font-semibold text-emerald-900">Revenue leak contained</h3>
          <p className="mt-2 text-sm text-emerald-900">
            CatchDrift detected the failure in {DETECTION_DURATION_MINUTES} minutes, linked it to deployment {DEMO_SCENARIO.deploymentIdentifier},
            and verified recovery across {DEMO_SCENARIO.recoveryWindowCount} consecutive windows.
          </p>
          <ul className="mt-3 space-y-1 text-sm text-emerald-900">
            <li>{PRESENTATION_COPY.exposureLabels.beforeDetection}: {EXPOSURE_BEFORE_DETECTION_LABEL}</li>
            <li>Detection duration: {DETECTION_DURATION_MINUTES} minutes</li>
            <li>Recovery windows verified: {DEMO_SCENARIO.recoveryWindowCount}</li>
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            {incidentUrl ? (
              <Link href={incidentUrl} className="rounded-md bg-emerald-900 px-3 py-2 text-sm font-semibold text-white">
                View completed incident
              </Link>
            ) : null}
            <button
              type="button"
              onClick={runSimulation}
              className="rounded-md border border-emerald-700 px-3 py-2 text-sm font-semibold text-emerald-900"
            >
              Restart simulation
            </button>
          </div>
        </section>
      ) : null}

      <div className="mt-4 rounded-md bg-slate-950 p-3 text-xs text-slate-100">
        {lines.length === 0 ? (
          <p className="text-slate-400">Simulation log appears here once the run starts.</p>
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

function MetricCard({ label, value, primary = false }: { label: string; value: string; primary?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${primary ? "border-rose-200 bg-rose-50" : "border-slate-200 bg-slate-50"}`}>
      <p className={`text-[11px] font-semibold uppercase tracking-wide ${primary ? "text-rose-700" : "text-slate-500"}`}>
        {label}
      </p>
      <p className={`mt-1 font-semibold ${primary ? "text-2xl text-rose-950" : "text-base text-slate-900"}`}>{value}</p>
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
