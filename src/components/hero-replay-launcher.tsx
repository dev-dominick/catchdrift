"use client";

import { useEffect, useState } from "react";
import {
  HERO_REPLAY_CTA_LABEL,
  REPLAY_DEMO_SECTION_ID,
  REPLAY_DEMO_STATE_EVENT,
  type ReplayDemoStateEventDetail,
  RUN_DEMO_REPLAY_EVENT,
} from "@/lib/demo-replay-events";

export function HeroReplayLauncher() {
  const [replayActive, setReplayActive] = useState(false);

  useEffect(() => {
    function handleReplayState(event: Event) {
      const active = (event as CustomEvent<ReplayDemoStateEventDetail>).detail?.active;
      if (typeof active === "boolean") {
        setReplayActive(active);
      }
    }

    window.addEventListener(REPLAY_DEMO_STATE_EVENT, handleReplayState);
    return () => window.removeEventListener(REPLAY_DEMO_STATE_EVENT, handleReplayState);
  }, []);

  function launchReplay() {
    if (replayActive) {
      return;
    }

    document.getElementById(REPLAY_DEMO_SECTION_ID)?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.dispatchEvent(new Event(RUN_DEMO_REPLAY_EVENT));
  }

  return (
    <button
      type="button"
      disabled={replayActive}
      onClick={launchReplay}
      className="rounded-md bg-cyan-300 px-3 py-2 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-300"
    >
      {replayActive ? "Replay running" : HERO_REPLAY_CTA_LABEL}
    </button>
  );
}