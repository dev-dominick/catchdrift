"use client";

import {
  HERO_REPLAY_CTA_LABEL,
  REPLAY_DEMO_SECTION_ID,
  RUN_DEMO_REPLAY_EVENT,
} from "@/lib/demo-replay-events";

export function HeroReplayLauncher() {
  function launchReplay() {
    document.getElementById(REPLAY_DEMO_SECTION_ID)?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.dispatchEvent(new Event(RUN_DEMO_REPLAY_EVENT));
  }

  return (
    <button
      type="button"
      onClick={launchReplay}
      className="rounded-md bg-cyan-300 px-3 py-2 text-sm font-semibold text-slate-950"
    >
      {HERO_REPLAY_CTA_LABEL}
    </button>
  );
}