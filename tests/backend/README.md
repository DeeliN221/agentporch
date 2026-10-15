# Backend tests

## Business scenarios

Server API, session read models, provider runtime, and filesystem behavior. Establish trustworthy data for consumers rather than only HTTP 200 responses.

## Commands

```sh
pnpm run test:server:smoke
pnpm run test:server
```

## Failure meaning

Missing sessions/history, incorrect provider bindings, or API contracts inconsistent with frontend expectations. Inspect actual read/write paths, temporary HOME/XDG isolation, and response shapes.

## Adding tests

Use this category for APIs, read models, runtime archives, provider binding, and disk recovery. Real browser interactions belong in spec or e2e.

Server smoke covers a named critical subset (Pi history, session read models, provider binding, and discovery); it is not full regression. `test:server` runs all `tests/backend/*.test.ts` and participates in the default test chain.
