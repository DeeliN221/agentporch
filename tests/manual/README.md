# Manual historical regressions

## Business scenarios

On-demand manual or historical tests requiring special provider behavior, old data, external services, or long reproduction sequences. They retain evidence of real user failures but are not all suitable for default CI.

## Commands

```sh
pnpm run test:manual:codex-resume
pnpm exec tsx --test tests/manual/node-history/*.test.ts
pnpm exec playwright test tests/manual/browser-history/*.spec.ts
```

## Failure meaning

A past ordering, recovery, or provider problem may have returned. First establish matching prerequisites, then decide whether to promote the risk to a default automated regression.

## Adding tests

Use only for manual confirmation, special environments, or historical audits. Stable automation belongs in backend, spec, or e2e so important risks are not hidden from default gates.

These commands are on-demand and outside default `pnpm test`. `tests/manual/browser-history` is not a default gate; check its environmental prerequisites before execution.
