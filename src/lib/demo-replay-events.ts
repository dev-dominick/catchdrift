export const HERO_REPLAY_CTA_LABEL = "Start the replay";
export const REPLAY_DEMO_SECTION_ID = "replay-demo";
export const REPLAY_DEMO_STATE_EVENT = "catchdrift:demo-replay-state";
export const RUN_DEMO_REPLAY_EVENT = "catchdrift:run-demo-replay";

export type ReplayDemoStateEventDetail = {
	active: boolean;
};