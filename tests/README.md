# Test categories

## Reading order

For non-specialist reviewers, start here, then read these category guides:

1. `tests/backend/README.md`: API, read-model, and runtime contracts.
2. `tests/unit/README.md`: fast Vitest business logic.
3. `tests/spec/README.md`: Node and browser specification acceptance.
4. `tests/e2e/README.md`: real pages, WebSockets, and persistence.
5. `tests/manual/README.md`: on-demand historical regressions and their prerequisites.

Tests cover real business requirements, not just component smoke checks. Failures should identify user risks such as inaccessible sessions, lost messages, inconsistent provider state, or recurring historical bugs.

## Category responsibilities

- `tests/backend`: server APIs, read models, provider runtime, filesystems, and contracts requiring no browser.
- `tests/unit`: Vitest pure/shared logic, normalization, and module behavior without backend runtime.
- `tests/spec`: Node contracts in top-level non-`.spec.ts` files and Playwright browser specifications in `*.spec.ts`.
- `tests/specs`: maintained Node specification contracts discovered by the Node-spec listing script.
- `tests/e2e`: complete frontend/backend navigation, WebSocket, and persistence flows.
- `tests/manual`: special environments, long scenarios, or historical audits outside default CI; `tests/manual/browser-history` is not a default gate.

## Commands

- `pnpm run test:server`: `tests/backend/*.test.ts`.
- `pnpm run test:vitest`: `tests/unit/**/*.test.ts`.
- `pnpm run test:spec:node`: contracts discovered by `scripts/list-node-spec-tests.mjs`.
- `pnpm run test:spec:browser`: `tests/spec/**/*.spec.ts`.
- `pnpm run test:e2e`: `tests/e2e/**/*.spec.ts`.
- `pnpm run qa:test:timing:fast`, `:smoke`, or `:full`: profile timings at `test-results/test-performance/<profile>.json`.
- `pnpm run test:manual:codex-resume`: manual Codex resume regression.
- `pnpm exec tsx --test tests/manual/node-history/*.test.ts`: on-demand historical Node audit, outside default tests.
- `pnpm exec playwright test tests/manual/browser-history/*.spec.ts`: on-demand historical browser audit, outside default gates. See `docs/testing/manual-history-inventory.md` for per-file disposition.

## Adding tests

Choose the business layer and runner first. Do not place executable tests directly in the `tests/` root. A manual test that becomes reliable automation should move into an appropriate default category.
