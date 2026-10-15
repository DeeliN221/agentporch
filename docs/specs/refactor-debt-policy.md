# Regression maintenance and module boundaries

## Requirement: Repair failures without weakening acceptance

Type checking, backend tests, and Node specification tests must continue to execute their real entry points. Do not bypass failures with skipped tests, focused tests, selective exclusion, mocked success results, or weakened assertions. A changed requirement must be reflected together in the specification, test, and acceptance explanation.

Run `pnpm run typecheck`, `pnpm run test:server`, and `pnpm run test:spec:node`. Store diagnostic command results under `test-results/`; generated evidence is not source material.

## Requirement: Preserve the established module split

Proposal 27 established separate Project overview, Chat runtime, and Backend server boundaries. Subsequent debt repair must preserve that split. Newer approved intent takes precedence over stale historical wording, but maintenance must not silently merge extracted modules back into oversized entry files.

The maintained executable contracts are under `tests/fixtures/module-boundary-contracts/`, and the default regression entry is `tests/specs/high-risk-module-refactor.spec.ts`. The fixtures retain assertions against actual production source rather than fabricated success responses.

## Requirement: Repair the relevant behavior

- Keep TypeScript declarations and test configuration consistent with actual dependencies.
- Verify Codex history cursors, tool cards, phase metadata, and overview summaries.
- Cover provider-only projects, temporary projects, missing-directory archival, and project deletion.
- Preserve rename, manual routing, deletion, and finalization semantics across providers.
- Keep configuration contracts and timing profiles aligned with current implementation.
- Keep durable specifications and test entry documentation synchronized.

## Requirement: Account for manual coverage

Move reproducible current risks into normal specification or browser tests. For tests requiring live providers, document their current value, prerequisites, and evidence locations. Explicitly classify obsolete assets instead of treating old screenshots as current verification. The inventory belongs under `docs/testing/`.

## Validation commands

```sh
pnpm run typecheck
pnpm run test:server
pnpm run test:spec:node
pnpm exec tsx --test tests/fixtures/module-boundary-contracts/*.test.ts tests/specs/high-risk-module-refactor.spec.ts
```

## Remaining risks

Static source checks cannot prove all assertion semantics. Structural contracts do not validate browser pixel layout or WebSocket timing. Live-provider end-to-end behavior may still require a documented manual check.
