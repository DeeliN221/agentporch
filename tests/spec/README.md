# Specification tests

## Business scenarios

Acceptance derived from maintained business requirements: sessions, workflow read models, repository taxonomy, and browser behavior. Use current provider runtime terminology: Codex app-server and Pi native SDK.

## Commands

```sh
pnpm run test:spec:node
pnpm run test:spec:browser
pnpm run test:spec
```

## Failure meaning

An approved specification contract is unmet: identity confusion, incomplete recovery, broken discovery, or unusable browser flows. Review the corresponding maintained spec and user risk.

## Adding tests

Place long-lived specification contracts here. Backend-only API tests belong in backend; complete user journeys belong in e2e. Never weaken acceptance merely to make implementation pass.

## Shared fixtures

Node specifications run directly as TypeScript without an implicit server build; use `pnpm run build:server` separately for distribution checks. Browser specs use Playwright; `test:spec` combines both.

Use `tests/spec/helpers/codex-jsonl-fixture.ts` for native JSONL fixtures and `tests/spec/helpers/fixture-session-discovery.ts` to await real project API discovery. Failures report projectPath, sessionId, routeIndex, providerSessionId, and candidates. Use `tests/spec/helpers/provider-runtime-harness.ts` for provider WebSocket substitution: only transport is replaced while pages, routing, APIs, and reducers remain real. Historical OpenSpec-derived assertions now follow canonical TypeScript tests and maintained specs; retired `.js` commands and proposal paths are not current entry points.
