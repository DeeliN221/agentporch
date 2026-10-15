# Vitest fast business logic

## Business scenarios

Pure/shared functions, display normalization, message deduplication, ordering, and rules requiring no backend runtime. Import real modules and realistic business examples; component mounting and snapshots alone are insufficient.

## Commands

```sh
pnpm run test:vitest
pnpm run test:vitest:watch
```

## Failure meaning

Duplicate messages, incorrect session identity, lost display data, or unintended dependency on ports, browsers, long-lived processes, and global state.

## Adding tests

Prefer low-state modules. Real APIs, databases, WebSocket servers, browser navigation, and persistence belong in backend, spec, or e2e tests.
