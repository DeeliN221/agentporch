# Specification index

Start here for current requirements. Each domain lists maintained specifications, executable tests, and source owners.

## Project and repository

- Specifications: `repo-simplification.md`、`workspace-git-removal.md`、`project-list-summary-api.md`
- Tests: `pnpm exec tsx --test tests/spec/test_suite_taxonomy.ts`、`pnpm exec tsx --test tests/specs/workspace-git-removal.spec.ts`
- Source owners: `backend/`、`frontend/`、`tests/`、`scripts/`

## Provider and runtime

- Specifications: `provider-indexing.md`、`provider-runtime-events.md`、`runtime-dependencies.md`、`provider-live-non-streaming-render.md`、`historical-provider-wording-assets.md`
- Tests: `pnpm exec tsx --test tests/specs/provider-runtime-boundary.spec.ts`、`pnpm exec tsx --test tests/specs/provider-live-non-streaming-render.spec.ts`、`pnpm exec tsx --test tests/specs/hermes-readonly-provider.spec.ts`、`pnpm exec tsx --test tests/backend/runtime-dependencies.test.ts`
- Source owners: `backend/`、`frontend/`、`tests/specs/`

## Workflow

- Specifications: `workflow-compatibility.md`、`wo-workflow-read-model.md`
- Tests: `pnpm exec tsx --test tests/backend/wo-workflow-contract.test.ts`、`pnpm exec tsx --test tests/specs/workflow-boundary.spec.ts`
- Source owners: `backend/`、`frontend/`、`tests/e2e/`

## Chat and sessions

- Specifications: `chat-performance.md`、`chat-composer-runtime.md`、`chat-session-identity.md`、`chat-message-merge-core.md`、`session-attention-board.md`、`codex-app-server-steer.md`、`codex-app-server-history.md`、`terminal-unified-entry.md`、`high-value-module-refactor.md`
- Tests: `pnpm exec tsx --test tests/specs/chat-session-identity.spec.ts`、`pnpm exec tsx --test tests/specs/session-attention-board.spec.ts`、`pnpm exec tsx --test tests/specs/terminal-unified-entry.spec.ts`、`pnpm exec tsx --test tests/spec/chat-history-full-text-search.spec.ts`、`pnpm exec tsx --test tests/specs/codex-history-message-order.spec.ts`、`pnpm exec tsx --test tests/specs/high-value-module-refactor.spec.ts`
- Source owners: `frontend/`、`backend/`、`tests/spec/`

## Pi input and tool cards

- Specifications: `pi-session-controls.md`、`pi-session-recovery.md`、`pi-tool-card-rendering.md`
- Tests: `pnpm exec playwright test tests/e2e/pi-session-61-direct-controls-tool-recovery.spec.ts`、`pnpm exec playwright test tests/e2e/pi-session-input-tool-rendering.spec.ts`
- Source owners: `frontend/`、`backend/`、`tests/manual/`

## Distribution and runtime boundaries

- Specifications: `npm-global-distribution.md`、`runtime-dependencies.md`
- Tests: `pnpm exec tsx --test tests/specs/npm-global-distribution.spec.ts`、`pnpm exec tsx --test tests/backend/runtime-dependencies.test.ts`
- Source owners: `backend/cli.ts`、`backend/runtime-user-state.ts`、`backend/server-main.ts`、`scripts/`

## Tests and Security

- Specifications: `test-suite-taxonomy.md`、`backend-security-boundary.md`、`backend-type-module-boundary.md`、`typescript-tooling.md`、`high-value-module-refactor.md`
- Tests: `pnpm exec tsx --test tests/spec/test_suite_taxonomy.ts`、`pnpm exec tsx --test tests/specs/spec-docs-boundary.spec.ts`、`pnpm exec tsx --test tests/specs/backend-security-boundary.spec.ts`、`pnpm exec tsx --test tests/spec/ci-quality-gate-contract.ts`
- Source owners: `backend/`、`tests/`、`docs/specs/`
