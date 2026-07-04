# E2E Test Matrix

Date: 2026-07-04

## Full Verification Matrix

| Layer | Command | Result |
| --- | --- | --- |
| Type Safety | pnpm typecheck | PASS |
| Lint | pnpm lint | PASS |
| Unit | pnpm test:unit | PASS (26 tests) |
| Integration | pnpm test:integration | PASS (19 tests) |
| Contract | pnpm test:contract | PASS (9 tests) |
| Production Build | pnpm build | PASS |
| End-to-End | pnpm test:e2e | PASS (22 passed, 4 skipped, 0 failed) |
| Aggregate Gate | pnpm verify | PASS |

## E2E Scenario Coverage

| Scenario | Desktop | Mobile | Notes |
| --- | --- | --- | --- |
| Replay reaches detection and recovery | PASS | Skipped by design in mobile project | Desktop-only lifecycle timing assertions |
| Replay async resilience on nav/refresh | PASS | Skipped by design in mobile project | Desktop reliability path |
| Concurrent replay/reset semantics | PASS | PASS | 409/429/409 semantics validated |
| Public-safe replay failure handling | PASS | PASS | Internal details not leaked |
| Stale-source suppression visibility | PASS | PASS | Sources UI and technical details verified |
| Canonical business value consistency | PASS | PASS | Homepage, inbox, incident detail consistency |
| Exposure progression stages | PASS | PASS | Stage progression labels and values validated |
| Inbox link resolvability across contexts | PASS | Skipped by design in mobile project | Reload, navigation, new-context validation |
| Public parity flow | PASS | PASS | Homepage, simulation, incident, sources |
| Route smoke with console/network checks | PASS | PASS | Desktop and mobile smoke |
| Mobile layout usability | Skipped by design in desktop project | PASS | Mobile-only viewport check |

## Hardening Changes Applied During Audit

1. Added replay start and run-progress retry logic for contention windows.
2. Added incident detail readiness and fallback navigation handling.
3. Reworked inbox-resolvability test to validate inbox evidence availability.
4. Filtered benign request aborts and expected replay contention console noise.

## Exit Criteria

All mandatory verification layers and full E2E suite passed in final run.
