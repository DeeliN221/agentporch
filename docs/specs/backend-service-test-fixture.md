# Real backend service test fixtures

## Requirement: Reuse shared real-service fixtures

### Scenario: Start real backend tests through the shared helper

Read actual test and helper source. `tests/backend/helpers/backend-service-fixture.ts` must export startup, authenticated-user setup, authenticated WebSocket, and shutdown helpers. Migrated tests must not spawn backend entry points directly.

### Scenario: Authenticate WebSocket tests with headers

`openAuthenticatedWebSocket` uses `authorization: Bearer`. Migrated tests must not use `/ws?token=`. Browser connection behavior remains covered by existing end-to-end tests.

## Requirement: Isolate subprocess state

### Scenario: Isolate authentication by database path

`startIsolatedBackendServer` explicitly sets `DATABASE_PATH`, `HOST`, and `SESSION_PATH_SCAN_INTERVAL_MS`. JWT secrets are isolated by database path. The helper must not read the developer's default auth database. This does not validate real external provider accounts.

## Validation

All three scenarios are audited by `tests/specs/backend-service-test-fixture.spec.ts`, using actual repository source. Evidence is written to `test-results/backend-service-fixture/source-audit.json`.
