# End-to-end tests

## Business scenarios

Real end-to-end user journeys: enter a project/session, send input, receive provider events, and inspect persisted results across frontend, backend, WebSockets, browser state, and fixtures.

## Commands

```sh
pnpm run test:e2e:smoke
pnpm run test:e2e
pnpm run test:browser:full
pnpm exec playwright test tests/e2e/pi-provider-business-flow.spec.ts
```

## Failure meaning

A broken user journey: missing buttons, incorrect route, unsent input, absent WebSocket events, or invisible responses. Keep traces, screenshots, or runtime logs rather than trusting component state alone.

## Adding tests

Use real browser/backend communication, session routing, and persistence. Pure Node/specification contracts belong in spec; API-only tests belong in backend.

Smoke runs a small set of critical project/provider journeys; `test:e2e` runs the full suite, and `test:browser:full` combines browser specs with full e2e. Tests of actual provider processes, server WebSockets, and persistence use real services or e2e fixtures. Reducer/rendering/route-binding event-shape tests can use the shared provider runtime harness in browser specs.
