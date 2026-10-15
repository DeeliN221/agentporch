# High-value module boundaries and CI gates

## Requirement: Keep page orchestration focused

| Entry | Responsibility | Focused modules |
| --- | --- | --- |
| `ChatInterface.tsx` | Chat orchestration | `chatInterfaceSearchNavigation.ts`, `chatInterfaceStatusReconcile.ts` |
| `ChatMessagesPane.tsx` | Message panel entry | `chatMessagesPaneLayoutController.ts` |
| `useProjectsState.ts` | Project-state orchestration | `projectsStateRefreshController.ts`, `projectsStateReducers.ts` |

Do not add `@ts-nocheck` to entry files. Move complex behavior into focused modules covered by default tests.

## Requirement: Match local and CI quality gates

Local development and GitHub CI share `test:ci` semantics:

```text
typecheck -> test:vitest -> test:server -> test:spec:node
```

The `node-checks` job in `.github/workflows/ci.yml` uses `.nvmrc`, `pnpm install --frozen-lockfile`, and `pnpm run test:ci` or equivalent commands. The local pre-commit hook uses the same entry without mutating the index. Do not obtain a pass by skipping tests, ignoring failures, or removing Node specification checks.

## Tests

- `tests/specs/high-value-module-refactor.spec.ts`
- `tests/spec/ci-quality-gate-contract.ts`
