# Specification: test categories and contributor guidance

## Requirements: understandable guidance

`tests/README.md` gives reviewers a reading order and links to `tests/backend/README.md`, `tests/unit/README.md`, `tests/spec/README.md`, `tests/e2e/README.md`, and `tests/manual/README.md`. Each guide explains business scenarios, commands, failure implications, and where to add tests. Guides and source commentary default to English in AgentPorch; Chinese belongs in explicit translations. This replaces the previous publication's Chinese-only documentation convention.

Representative backend, specification, end-to-end, and manual-history tests explain the protected business purpose and user risk near their headers and important assertions, rather than restating function names. Reorganization does not weaken coverage: `test:vitest`, `test:server`, `test:spec`, and `test:e2e` remain available. Executable tests do not return to the `tests/` root. Manual-history tests are clearly on-demand, never represented as default CI coverage.

## Requirements: fast low-state Vitest layer

`pnpm run test:vitest` discovers `tests/unit/**/*.test.ts`, runs at least **five** real business test files, and imports actual modules from at least **two** source roots with realistic examples. It supplements typechecks, server builds, Node tests, and Playwright.

The default suite includes:

- `tests/unit/project-routing-refresh.test.ts`: cN and legacy routes, workflow children, provider ownership, visible sessions, summary merging, and temporary-session replacement.
- `tests/unit/workflow-detail-view-model.test.ts`: visual progress, continuation state, stage tables, and role-artifact selection.
- `tests/unit/chat-tool-runtime.test.ts`: Pi queue route identity, active sessions, tool fallback configuration, hidden results, and execution-result content.

Vitest includes only `tests/unit/**/*.test.ts`, not backend, browser specs, e2e, or manual-history tests. Unit tests do not start listening ports, WebSockets, databases, long-lived processes, or browsers. Tests manipulating HOME/XDG/PATH or real provider runtime stay in the appropriate Node/integration layer. `test:server` is not removed or replaced by Vitest.

Default backend tests include `tests/backend/command-parser.test.ts` and `tests/backend/file-routes-boundary.test.ts`: command allowlists, rejected shell operators and dangerous arguments, path containment, output cleanup, file-tree exclusions, and rwx permission text. These helpers do not replace real HTTP/provider/WebSocket integration coverage.

`tests/spec/test_suite_taxonomy.ts` accepts the unit category but continues rejecting executable tests at the test root.

## Requirements: distinct execution gates

Typechecking continues to use `tsc -b --noEmit`; `build:server` starts with `tsc -p tsconfig.build.json` and does not revive removed handwritten JavaScript runtime copies. Node/server specifications use `tsx --test`; browser behavior uses Playwright.

`test:spec:node` directly executes TypeScript specifications without implicitly rebuilding the server. `test:server:smoke` names an explicit critical subset and is not described as complete coverage. `test:node` combines `test:server` and `test:spec:node`; the server suite still covers `tests/backend/*.test.ts`.

`test:e2e:smoke` starts real fixtures and the application for a small set of critical user flows. `test:browser:full` combines browser specs and full e2e without `tests/manual/browser-history`. Passing tests do not produce large default trace/video/screenshot collections; failures retain diagnostic evidence.

`test:fast` performs quick checks without full Playwright e2e. `test:smoke` runs fast checks followed by e2e smoke. `test:full` and `pnpm test` cover typechecking, Vitest, complete Node regressions, and complete browser regressions. Timing collection emits command, duration, and exit code as JSON and never records failed commands as successful.

## Requirements: preserve the repaired baseline

The former Proposal 28 repair is maintained: `typecheck` includes test types, `test:server` covers `tests/backend/*.test.ts`, and `test:spec:node` discovers specifications through `scripts/list-node-spec-tests.mjs`. Do not add `test.skip`, `describe.skip`, `.only(`, or `todo(` to bypass failures. `tests/specs/testing-baseline-fixtures.spec.ts` examines actual package scripts, discovery code, and default test directories. It does not recursively run every gate; delivery evidence must record actual execution.

`pnpm run typecheck:test` with `tsconfig.test.json` must pass and remains part of `typecheck`. Do not delete tests, weaken root compiler settings, or disable test checking to achieve this. Shared provider/browser harness declarations are included.

## Requirements: reusable provider fixtures

A shared Codex JSONL helper writes discoverable fixture sessions and waits for the real project API. It returns session ID, `routeIndex`, `providerSessionId`, and message endpoint. Failure diagnostics include `projectPath`, `sessionId`, `routeIndex`, and candidate sessions; opaque fixture-not-found errors are insufficient.

Browser specs injecting provider events reuse the shared WebSocket harness. It provides accepted/status/response/complete/error builders and records sent messages, runtime events, console evidence, and network evidence. Migrated specs do not redefine local socket classes or directly replace `window.WebSocket` again.
