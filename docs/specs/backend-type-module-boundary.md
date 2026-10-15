# Specification: backend type and module boundaries

## Requirements: checked, diagnosable core

Core startup, Codex runtime, and message-processing files pass Node TypeScript compilation without `@ts-nocheck`, `@ts-ignore`, or `@ts-expect-error`. New fallback/error paths cannot hide failures through empty catches or `.catch(() => null/false/undefined)`.

`backend/index.ts` remains a small bootstrap and `backend/server-main.ts` a typed startup boundary. Neither absorbs operational route, WebSocket, static-resource, or file-operation bodies. Codex JSONL, app-server, and native-runtime event normalization share one primary transform; old entry points call the shared normalizer.

## Requirements: server assembly

`backend/server-main-legacy.ts` is a small assembly layer, not a large HTTP registrar, collection of WebSocket message handlers, or watcher lifecycle implementation. Typed modules `backend/server/app-factory.ts`, `http-routes.ts`, `file-routes.ts`, `chat-websocket.ts`, `shell-websocket.ts`, and `provider-watchers.ts` retain those responsibilities.

`backend/server/http-routes.ts` and `server-bootstrap.ts` own startup assembly, dependency injection, and lifecycle coordination. Business URLs for system updates, projects, workflows, sessions, attachments, usage, and diagnostics belong in `backend/server/http/*-routes.ts`; `/api/system/update` belongs in `system-routes.ts`. Bootstrap uses `register*Routes(...)` without directly registering Express handlers.

Each business route module exports a named dependency interface used by `register*Routes(deps)`. Neither `deps: any` nor `any` dependency fields are permitted; use concrete functions, stores, system adapters, or an explicit `unknown` input boundary. `backend/server/backend-http-routes.ts` only orchestrates modules and minimally maps dependencies, without accumulating handler bodies.

## Requirements: project domain implementations

Provider indexing, project overview, manual routes, and archive storage live in typed `backend/domains/projects/*.ts` modules without suppressions. `backend/projects.ts` remains within the size limit enforced by its boundary test and cannot absorb provider-index implementation.

`project-domain-core.ts` exists as a short compatibility layer without suppressions. Handwritten `project-domain-core.js`/`.d.ts`, `project-domain-runtime-compat.*`, and `project-domain-legacy-runtime.*` must not return. Focused modules cannot import renamed `*-implementation.js` fallbacks. Server builds do not copy handwritten project-domain JS, Node compiler configuration keeps `allowJs` disabled, and `project-domain-service.ts` does not use incompatible `.ts` import extensions. ESM `.js` import specifiers are valid only when referring to compiled TypeScript rather than a physical handwritten JS core.

Public facade functions remain available: `getProjects`, `getSessionMessages`, `createManualSessionDraft`, `finalizeManualSessionRoute`, `renameProject`, `renameSession`, `deleteProject`, `searchChatHistory`, and `indexProviderSessionFile`. Discovery, configuration, manual routing, overview, search, rename, deletion, provider transcripts/index/list/read-model modules own actual local typed implementations. They cannot merely re-export an old core, forward `...args` into a renamed migration body, or substitute sentinel constants such as `export const xxxEntry = true`. The compatibility core cannot redefine those principal business implementations.

## Requirements: injectable Codex runtime

`backend/domains/codex-app-server/stdio-transport.ts`, `session-manager.ts`, `notification-reducer.ts`, and `runtime-facade.ts` remain separate checked modules. The facade composes transport, session management, and notification reduction so test doubles can exercise steering, streaming, and recovery. It does not directly implement iteration over failed running sessions or swallow runtime errors through empty catches.

## Requirements: realtime dispatch and ownership

`backend/server/chat-websocket.ts` owns connection lifecycle, registration, parsing, and close cleanup. It registers a real message handler and calls `createChatCommandDispatcher`. Protocol branches for `codex-command`, `pi-command`, `abort-session`, `subscribe-session`, and `check-session-status` belong in `backend/server/realtime/chat-command-dispatcher.ts`, including runtime send/abort/status calls. The socket handler cannot directly call `sendNativeMessage`/`abortNativeSession` or rebuild a large `data.type` switch.

Session-private Codex/Pi deltas use the session subscription registry; user identity alone is not a sufficient delivery boundary. `backend/server/websocket-gateway.ts` owns path dispatch and explicitly exposes chat/shell handlers and WebSocket authentication. Public workflow changes/project invalidations use an independent bus preserving debounce and cache-clear semantics. Runtime writers pass through an adapter that injects ownership fields before delivery.

## Validation and evidence

Primary contracts: `tests/specs/backend-type-module-boundary.spec.ts`, `tests/specs/backend-realtime-boundary.spec.ts`, and `tests/specs/codex-ws-turn-ownership.spec.ts`.

Retain the corresponding evidence outputs:

- `test-results/oz-110-server-legacy-boundary/boundary-snapshot.json`
- `test-results/13-project-domain-ts-boundary/source-audit.json`
- `test-results/oz-113-codex-app-server-runtime/boundary-snapshot.json`
- `test-results/backend-realtime-boundary/source-audit.json`
- `test-results/9-server-entry/source-audit.json`, `api-routes.json`, `websocket-delivery.log`, `project-invalidation.log`, `security-runtime.log`, and `server-startup.log`
