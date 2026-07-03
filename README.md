# CatchDrift

CatchDrift detects when tracking breaks during active campaign spend, estimates financial exposure, and verifies recovery before manual reporting catches up.

## Submission in 30 seconds

- Live URL: https://catchdrift.media/
- Railway URL: https://catchdrift-web-production.up.railway.app
- Repository: https://github.com/dev-dominick/catchdrift
- Demo path: homepage -> run live replay -> incident appears active -> recovery verified on incident page

## The expensive operational problem

Paid campaigns can continue spending while attribution quality silently degrades after landing-page or tracking changes. Teams often see performance symptoms later in dashboards, but not fast enough to connect:

- money at risk while spend stays active;
- the likely operational change;
- what to inspect first;
- whether recovery is actually complete.

CatchDrift focuses on this specific failure mode because one high-spend incident detected earlier can justify the system.

## Demo outcome and financial exposure

Example from deterministic replay profile:

- Active spend at risk: $900/hour
- Estimated exposure rate: $230-$310/hour
- Detection window: 3 degraded intervals (15 minutes in replay)
- Expected manual discovery delay: 90 minutes
- Exposure surfaced earlier: $344-$465

Demo estimates are based on the controlled replay scenario. They are estimated exposure signals, not confirmed money saved.

## How the workflow works

CatchDrift continuously evaluates campaign telemetry and deployment events, then opens a deterministic incident when all required conditions persist:

- spend remains materially active;
- click-to-session loss degrades above threshold;
- attribution declines above threshold;
- degradation persists for required intervals;
- required sources are fresh (stale-source suppression prevents unsafe decisions).

When triggered, CatchDrift records immutable incident evidence:

- baseline metrics;
- threshold requirements;
- degraded-window signals;
- deterministic deployment correlation score;
- deterministic exposure range.

It then tracks lifecycle transitions from detected to recovered/resolved and verifies recovery using explicit metric criteria.

## Why this matters to It's Today Media

It's Today Media operates high-tempo media buying across multiple channels where landing pages, tracking integrity, and attribution quality directly affect spend efficiency. CatchDrift protects the gap between an operational tracking failure and when a buyer would otherwise discover it from delayed reporting.

The first production rollout would calibrate thresholds against It's Today Media's campaign volume, reporting latency, deployment cadence, and acceptable false-positive rate.

## Run the live demo

1. Open `/`.
2. Click `Run the 25-second incident replay`.
3. Observe active incident state before recovery.
4. Keep incident detail open and watch status update to recovered.

CLI equivalent:

- `pnpm demo:reset`
- `pnpm demo:replay`

## What I would build next

1. Operator discovery interviews to calibrate detection thresholds and alert fatigue tolerance.
2. Connector ingestion from real ad, attribution, and deployment systems.
3. Channel delivery into Slack/ticketing with acknowledgement loops.
4. Additional deterministic rules for conversion-path integrity variants.
5. Outcome instrumentation for time-to-detect, time-to-acknowledge, and estimated exposure surfaced.

## Real versus replay-controlled

Real:

- ingestion API contracts;
- persistence, idempotency, revision handling;
- worker queue + retries;
- deterministic rule and exposure logic;
- deterministic correlation and recovery tracking;
- asynchronous replay run-state contracts (202/200/409/429);
- UI workflow across incident states.

Replay-controlled:

- campaign telemetry source values for replay;
- deployment event feed input for replay;
- external ad-platform connectors.

## Architecture

```mermaid
flowchart LR
  A[Ingestion APIs] --> B[(PostgreSQL)]
  B --> C[Durable Jobs]
  C --> D[Worker Evaluator]
  D --> E[Rule Evaluations]
  D --> F[Incidents + Evidence]
  F --> G[Incident UI]
  F --> H[Optional AI Buyer Brief]
  I[Demo Replay Orchestrator] --> B
  I --> C
  I --> J[Demo Run State API]
```

Runtime details:

- Normal ingestion uses durable queued jobs and a worker.
- Contest demo replay processes only its isolated demo jobs inline without relying on a separately scheduled worker.
- Both paths use the same persisted evaluation and incident logic.

## Safety boundaries

CatchDrift keeps all financial and incident decisions deterministic.

AI is optional and limited to an investigation brief generated from persisted structured evidence. AI may summarize and prioritize inspection steps, but AI may not:

- create incidents;
- change severity or confidence;
- alter exposure values;
- claim causation;
- control campaign spend.

If model configuration is unavailable or output is invalid, CatchDrift falls back to deterministic guidance.

## Local Setup

1. Install dependencies: `pnpm install`
2. Start PostgreSQL: `docker compose up -d`
3. Copy env: `cp .env.example .env`
4. Run migration: `pnpm db:migrate`
5. Start worker + web:
   - `pnpm start:worker`
   - `pnpm dev`

## Environment Variables

Required:

- `DATABASE_URL`
- `INGESTION_TOKEN`
- `WORKER_ID`
- `NODE_ENV`
- `APP_BASE_URL`

Optional (AI brief):

- `OPENAI_API_KEY`
- `OPENAI_MODEL` (default: `gpt-4.1-mini`)

## Verification

- Typecheck: `pnpm typecheck`
- Lint: `pnpm lint`
- Unit: `pnpm test:unit`
- Integration: `pnpm test:integration`
- Combined unit + integration: `pnpm test`
- E2E: `pnpm test:e2e`
- Full automated suite: `pnpm test:all`
- Contest verification gate: `pnpm verify`

`pnpm verify` runs: typecheck, lint, unit tests, integration tests, production build, and E2E.

## Detailed technical notes

- Rule identity: `tracking_integrity_failure@1`
- Required stale-source suppression is derived from current time and source delay expectations, not trusted from persisted `freshness_state`.
- Incident correlation is strongest-evidence correlation, not root-cause proof.
- Exposure is deterministic and labeled as estimate.
- Replay and reset endpoints enforce contention and throttle semantics:
  - `202` replay accepted;
  - `200` status polling responses;
  - `409` contention conflicts;
  - `429` cooldown/rate limits;
  - safe `5xx` operational failures with public reference IDs.
