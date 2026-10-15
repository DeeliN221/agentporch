# Specification: TypeScript tooling and test entry points

## Requirements: source roots and executable builds

Backend source lives in `backend/`, frontend source in `frontend/`; retired `server/` and `src/` source roots do not return. Package entry points, build outputs, development watchers, WebSocket rewrite scripts, Vite/Tailwind scans, distribution lists, and active comments use current paths.

Frontend components and entry points use `.tsx`, including `frontend/main.tsx`, with typed props, context, and events. Backend/shared implementations use TypeScript rather than `.js`, `.mjs`, or `.cjs`. Scripts/configurations should use TypeScript; any external-tool-required JS shim needs an explicit exception and retirement condition. Tests/helpers use TypeScript while retaining business assertions.

Main tsconfigs do not use `allowJs: true` or hide unmigrated source by exclusion. Web, Node, and test boundaries are separate. Types for known API responses, WebSocket messages, workflows, provider sessions, and project configuration express their actual fields, not broad `Record<string, unknown>` substitutes. External JSON/CLI/library events can enter as `unknown` or controlled `any` only at parsing boundaries and must be normalized before business functions.

Do not retain paired handwritten `.js`/`.d.ts` sources. Shared functions and types are maintained in `.ts`; retired frontend pairs such as `messageDedup.js`, `sessionMessageDedup.js`, and `sessionActivityState.js` do not return.

## Requirements: checks and caching

Package scripts expose `typecheck:web`, `typecheck:node`, and `typecheck:test`; root `typecheck` runs all three. Incremental caches live in ignored `.tmp/tsbuildinfo/`. `build:server` compiles through `tsc -p tsconfig.build.json` into ignored `dist-node` and copies required runtime assets. A historical requirement to copy handwritten backend JS is superseded by the TypeScript-only source contract: do not revive obsolete JS implementations. Build outputs are not committed.

`pnpm run server` uses a declared TS runner or executable compiled output. CLI `agentporch` points at a Node-executable file and preserves existing CLI behavior. Postinstall works after TS migration without undeclared transitive runners. Node and Playwright commands load TS tests/helpers instead of obsolete JS patterns.

## Requirements: preserve behavior

Projects, manual-session creation/resumption, routes, provider state, message rendering, and API field names remain stable. Chat send/provider switching/history, files/editor, Shell, settings, and workflow details remain usable without blank regions or import-extension failures. Workflow lists retain stages, artifacts, and child-session links from the current read model, never using ignored project-local `.wo/runs` as current state.

Runtime diagnostics retain missing commands, check actions, provider identity, underlying error causes, and PATH information. The unified readiness report includes `oz`, `codex`, and `pi`, each with command path, version, error, and required action. Executable Codex/Pi with uncertain login state reports `authenticated: unknown` and suggests `codex login` or `pi login`. `oz flow contract --json` must advertise `run`, `resume`, `status`, and `abort`; any missing capability makes overall `ready` false with a specific oz error. Obsolete co support is not restored to satisfy historical wording.

New/moved source files explain their business purpose; nontrivial functions retain useful logic documentation. Tests exercise user behavior, accessible names, API responses, or business state rather than mere component existence.

## Requirements: test taxonomy and discovery

Executable tests are categorized in backend, unit, spec/specs, e2e, or manual directories, never scattered at `tests/` root. `test:server` runs backend tests; `test:spec:node` discovers Node contracts, including top-level non-`.spec.ts` files in `tests/spec` without requiring a `test_` prefix; `test:spec:browser` runs browser specs; `test:e2e` runs complete user flows.

Playwright discovers `tests/spec/**/*.spec.ts` instead of enumerating retired root-level proposal names. Names describe business topics, retaining proposal numbers only when useful, without migration date prefixes or duplicated dates. `tests/README.md` explains categories, commands, and placement rules.

`pnpm test` is the full acceptance entry point, including typechecks, server tests, spec tests, e2e, and the fast Vitest layer described in [test taxonomy](test-suite-taxonomy.md). `test:spec` includes both Node and browser checks. Browser failures propagate to the full command. Full acceptance requires exit zero without new unconditional or conditional skips added to hide regressions.

## Requirements: canonical regressions and state paths

Duplicate proposal tests are consolidated into canonical backend/spec tests only after unique assertions migrate. Playwright cannot reference removed copies. Newer approved implementation intent takes precedence over obsolete proposal assertions; do not restore retired behavior merely to satisfy an old test. Changes document tests removed, merged, updated, or repaired.

Use `resolveFlowRunsRoot`, `resolveFlowRunStatePath`, or fixture helpers for oz flow state. Use `getProjectLocalConfigPath` for session UI configuration, favorites, pending markers, and hidden sessions. Project-local `.wo/runs/<run>/state.json` and `.agentporch/conf.json` are not current state paths. `.wo/runs/.../logs/...` may remain as displayed artifact text or a relative artifact path, never as the actual fixture state root.

Historical selector, fixture-path, wording, and timing failures are repaired or retired according to current contracts rather than granted permanent exemptions. New real regressions block completion. `pnpm test` must reproduce acceptance.

Node specification contracts verify the full test-script chain, Node/browser discovery, absence of retired duplicate tests and stale `.jsx`/runtime/date references, presence of canonical replacements, and fixture use of `resolveFlowRunStatePath` instead of hardcoded `.wo/runs` or `.agentporch/runs`.

## Validation commands

- `pnpm exec tsx --test tests/spec/test_suite_taxonomy.ts`
- `pnpm exec tsx --test tests/specs/typescript-tooling-cache.spec.ts`
- `pnpm exec tsx --test tests/manual/node-history/typescript-config-contract.ts`
