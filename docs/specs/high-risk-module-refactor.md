# High-risk module refactor

These durable boundaries keep ProjectOverviewPanel, core chat hooks, and backend server entry points reviewable rather than accumulating unrelated behavior in large files.

## User risks

ProjectOverviewPanel coordinates workflow entries, manual sessions, and actions. Chat session/composer/realtime hooks protect loading, submission, realtime delivery, and streaming merges. Backend bootstrap, command dispatch, and file routes protect startup, WebSocket dispatch, and filesystem boundaries.

## Module boundaries

- ProjectOverviewPanel composes `projectOverviewViewModel`, `ProjectOverviewWorkflowGroups`, `ProjectOverviewSessionCards`, and `ProjectOverviewActions`, delegating implementation.
- `useChatSessionStateImpl`, `useChatComposerStateImpl`, and `useChatRealtimeHandlersImpl` retain their import paths and compose `chatSessionLifecycleController`, `composerSubmitRuntime`, `chatRealtimeEventRouter`, and `streamingMessageController`.
- Backend bootstrap, dispatcher, and file routes are assembly entries. Separate client-scope stores, command routers, file helpers, and tree/mutation/download modules provide testable boundaries.

## Requirement: Preserve the business contracts

- Project overview composition stays below 700 lines, imports its four focused modules, and does not inline SVG icon components.
- Chat session, composer, and realtime hooks stay within their line budgets; lifecycle, submission, routing, and streaming rules live in controllers.
- Backend bootstrap, chat dispatcher, and file routes stay within their budgets and delegate to their extracted modules.
- The provider transcript reducer lives at `shared/provider-runtime-transcript.ts`. Frontend adapters and backend runtime stores depend on shared pure logic; the backend must not import a frontend chat reducer.
- Chat and overview runtimes remain assembly layers. Focused modules own history loading, chunked loading, hydration, scrolling, realtime events, attachments, dispatch, batching, and section rendering.
- Agent routes delegate sensitive behavior to authentication, path resolution, GitHub operations, session runners, and response writers. Do not reintroduce `@ts-nocheck` or put GitHub tokens in URLs, logs, or process arguments.
- Split tool configuration by read/edit/exec/provider/workflow families. Public payload configuration uses `unknown`, `Record<string, unknown>`, or parsers/guards rather than default `any` extension points.
- Default tests cover models, controllers, backend boundaries, and this specification rather than relying solely on one-time proposal tests.
- Later maintenance must preserve these boundaries. When old assertions conflict with newer approved intent, update specifications and tests together rather than bypassing them.

## Validation commands

- `pnpm exec tsx --test tests/specs/core-architecture-boundary.spec.ts`
- `pnpm exec tsx --test tests/fixtures/module-boundary-contracts/*.test.ts`
- `pnpm run test:vitest`
- `pnpm run test:server`
- `pnpm run test:spec:node`
- `pnpm run typecheck`

## Remaining risks

Structural checks do not change public routes, API URLs, WebSocket message types, or file-response shapes. Existing end-to-end tests cover browser layout. Source-boundary tests do not launch real HTTP/WebSocket services or model browser timing. Full server, Node-spec, and test-typechecking gates must still be run independently.
