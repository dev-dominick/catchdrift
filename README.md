# CatchDrift

CatchDrift is a deployment-aware campaign protection MVP for performance marketing teams. It detects a tracking integrity failure while spend is active, correlates it with a relevant deployment, computes exposure, and verifies recovery.

## Submission Links

- Live URL: `TBD`
- Repository URL: `https://github.com/dev-dominick/catchdrift`
- Loom Walkthrough: `TBD`

## Completed Proof

The repository implements and replays one deterministic end-to-end workflow:

1. Build a healthy baseline with 12 mature five-minute intervals.
2. Ingest deployment `v42` removing click-ID forwarding.
3. Ingest 3 degraded mature intervals while spend continues.
4. Trigger `tracking_integrity_failure@1` only after the third degraded interval.
5. Correlate the incident with deployment evidence and score components.
6. Calculate exposure around `$230-$310/hour` from inputs.
7. Ingest corrective deployment `v43` and recovery intervals.
8. Mark incident `recovered` without deleting original evidence.

## What The Tool Does

CatchDrift reconciles spend, clicks, sessions, internal submissions, attributed conversions, revenue, and deployment changes. It creates an exception with transparent evidence when tracking integrity fails.

## Why This Project

The project focuses on a financially meaningful failure mode: spend continues while tracking quality degrades after deployment. It demonstrates ingestion, processing, deterministic detection, persistence, and recovery verification in one reproducible workflow.

## What Is Real vs Simulated

Real:
- Authenticated ingestion API (`/api/ingest/metrics`, `/api/ingest/deployments`)
- PostgreSQL persistence with idempotency and revisions
- Worker with PostgreSQL-backed jobs and retries
- Deterministic rule evaluation and suppression logging
- Deployment correlation scoring
- Exposure calculation and incident lifecycle
- Recovery detection

Simulated:
- Campaign source values are controlled demo data
- No provider OAuth connectors (Meta/Google/TikTok/Taboola)
- No automatic campaign remediation

## Architecture

Modular monolith:
- Web process: Next.js App Router pages + API routes
- Worker process: job claiming + campaign evaluation pipeline
- Database: PostgreSQL + Drizzle schema/migrations

Core flow:
- Ingestion -> observation persistence -> job enqueue -> worker evaluate -> rule evaluation record -> incident + evidence -> recovery evaluation

## Deterministic AI Boundary

No LLM decides incidents, baselines, confidence, or exposure values. Detection and financial logic are deterministic TypeScript modules with tests.

## Local Setup

1. `cp .env.example .env`
2. `pnpm install`
3. Start PostgreSQL
4. `pnpm db:migrate`
5. `pnpm demo:replay`
6. `pnpm dev`

## Railway Deployment

Create three Railway services:
- PostgreSQL
- Web service (`pnpm start:web`)
- Worker service (`pnpm start:worker`)

Required env vars:
- `DATABASE_URL`
- `INGESTION_TOKEN`
- `WORKER_ID`
- `NODE_ENV`
- `APP_BASE_URL`

Run migration on deploy:
- `pnpm db:migrate`

Health endpoints:
- `/api/health`
- `/api/healthz`

Custom domain setup:
- Attach `catchdrift.media` to the web service in Railway domain settings.

## Demo Replay

CLI commands:
- `pnpm demo:reset`
- `pnpm demo:replay`

Expected output:

```text
✓ Demo workspace reset
✓ Campaign mapping created
✓ 12 healthy intervals ingested
✓ Healthy evaluations completed without an incident
✓ Deployment v42 recorded
✓ First degraded interval matured — incident withheld
✓ Second degraded interval matured — incident withheld
✓ Third degraded interval matured
✓ tracking_integrity_failure@1 triggered
✓ Deployment v42 correlated
✓ Exposure calculated at $230-$310/hour
✓ Incident persisted with versioned evidence
✓ Deployment v43 recorded
✓ Recovery intervals ingested
✓ Campaign recovered
```

## Testing

- Unit tests: baseline median, thresholds, maturity gating, exposure, correlation.
- Integration tests: idempotency/revision semantics, dedup behavior, stale suppression semantics, recovery evidence preservation.
- E2E test: demo replay through UI and incident lifecycle.

Commands:
- `pnpm test`
- `pnpm test:e2e`
- `pnpm typecheck`
- `pnpm lint`

## Security

- Environment-scoped secrets only.
- Bearer authentication for ingestion endpoints.
- Bounded demo reset/replay endpoints for deterministic contest workflow.
- Aggregate metric storage only (no lead PII).
- Redacted worker error persistence (`last_error_redacted`).
- Workspace-scoped queries.
- Read-only operational stance for campaign systems.

## Known Limitations

- Contest MVP uses one explicit campaign mapping.
- One primary detection rule only: `tracking_integrity_failure@1`.
- Controlled campaign data instead of live ad-platform connectors.
- No automatic remediation actions.

## What I Would Build Next

1. Add read-only production connectors in priority order by financial impact.
2. Expand deterministic rules from real incident history.
3. Add operator workflow integrations (ticketing/Slack) with approval gates.
4. Add stronger tenancy and RBAC controls for multi-workspace deployments.
