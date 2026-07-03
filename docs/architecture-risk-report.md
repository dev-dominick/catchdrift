# CatchDrift Architecture Risk Report (Baseline)

Date: 2026-07-03
Repository: /Users/dom/workspace/catchdrift
Branch: main
Commit: e80b8f2c1598d3fc4d49ae0fbca8ebbc67f3b4f0
Working tree: clean

## Baseline verification evidence

All baseline commands were executed before code changes.

- pnpm install --frozen-lockfile: pass
- pnpm typecheck: pass
- pnpm lint: pass
- pnpm test:unit: pass (21 tests)
- pnpm test:integration: pass (16 tests)
- pnpm build: pass
- pnpm test:e2e: pass (9 passed, 3 skipped)
- pnpm test:all: pass
- pnpm verify: pass

## Current architecture truth

- Application is a modular monolith in deployment shape but not yet in code boundaries.
- Domain and data access are mixed in src/domain/engine.ts.
- API routes directly call large service functions and return inconsistent error envelopes.
- Demo orchestration uses DB persistence and advisory lock, but several operational and security boundaries remain implicit.

## Highest risks (P0)

1. Production-exposed test routes
- Evidence: build includes /api/demo/test/hard-reset and /api/demo/test/stale-source routes.
- Risk: release blocker; test mutation surfaces remain discoverable in production bundles.
- Boundary: move test-only capabilities behind test-only helper paths excluded from production build.

2. Migration execution race on startup
- Evidence: scripts/start-production.sh runs pnpm db:migrate for non-worker role; no lock in migrator script.
- Risk: concurrent web replicas can race schema changes.
- Boundary: advisory-lock-protected migration plus fail-fast startup; prefer dedicated migration execution flow.

3. Service-layer monolith
- Evidence: src/domain/engine.ts is 1195 lines and is imported by 13 modules (API routes, pages, worker, demo scenario).
- Risk: mixed responsibilities (ingestion, evaluation, incidents, jobs, read models, demo reset) make change risk high and contracts unclear.
- Boundary: split by capability (ingestion, evaluation, incidents, jobs, source health, demo workspace) while preserving behavior.

4. Inconsistent and unsafe API error contracts
- Evidence: routes return mixed error shapes ({ error: string }, { error: { code, message } }, validation details ad hoc).
- Risk: unstable API behavior and accidental internal leakage.
- Boundary: one typed application error model + shared HTTP mapping and response envelope.

5. Readiness/liveness semantics are inverted
- Evidence: /api/health checks DB and /api/healthz only returns {ok:true}; no schema-readiness signal.
- Risk: deploy platform may route traffic to instances not ready for serving.
- Boundary: /api/health/live process-only; /api/health/ready dependency + schema checks + short timeout.

6. Configuration boundary is incomplete
- Evidence: src/lib/env.ts does not validate APP_BASE_URL and other runtime controls; direct process.env reads exist in runtime and AI code.
- Risk: invalid startup configuration and inconsistent secure defaults.
- Boundary: central typed config object and no direct process.env reads outside config.

7. Authentication compare is not constant-time
- Evidence: token compare in src/lib/auth.ts uses plain equality.
- Risk: avoidable timing side-channel for bearer token checks.
- Boundary: constant-time token comparison utility with length guard.

8. Transaction boundaries are implicit for multi-write operations
- Evidence: createIncident inserts incident, evidence, and event in separate statements without explicit transaction.
- Risk: partial incident persistence under mid-operation failure.
- Boundary: explicit transaction helper in db layer for incident creation and other multi-write operations.

## Additional risks (P1/P2)

- No structured logger/request IDs across route and worker flow.
- No graceful shutdown flow in worker loop.
- Missing explicit DB constraints for some domain invariants (e.g., non-negative values, interval ordering).
- No CI workflow in repository (.github missing).
- AI adapter reads env directly and lacks centralized redaction and provider failure categorization.

## Large modules and unclear dependency concentration

Largest modules by line count:
- src/domain/engine.ts (1195)
- src/app/incidents/[incidentId]/page.tsx (473)
- src/demo/scenario.ts (373)
- src/demo/runtime.ts (370)

Dependency concentration:
- 13 files import src/domain/engine.ts directly.

## Refactoring boundaries approved for implementation

P0 scope (execute first):
1. Remove production test-only route surfaces.
2. Add migration lock strategy and startup fail-fast behavior.
3. Add unified API error contract and route-level mapping.
4. Add liveness/readiness split with schema check.
5. Add minimal structured logger + request IDs + redaction policy scaffold.
6. Add transaction for incident creation path.

P1 scope (after P0 green):
1. Extract engine bounded modules with explicit contracts.
2. Introduce application command/query functions and route thinning.
3. Expand integration/contract tests for rollback and error envelopes.

## Non-goals in this pass

- No microservice split.
- No command bus framework.
- No speculative abstractions without concrete consumers.
- No in-memory replacement of PostgreSQL durability.
