# Specification: lightweight project summaries

## Requirements: bounded, database-backed project lists

`GET /api/projects` answers which projects exist. Every summary includes route name, display name, project path, and `routePath`, including projects shared by provider history and oz flow runs. It contains no `sessions`, `codexSessions`, `piSessions`, `workflows`, or `batches` arrays and remains bounded in size.

When SQLite `project_index` has visible projects, the default list reads them without scanning `.codex` or `.pi`. Renaming updates `displayName` in the database-backed list; deletion removes the project from it. The shared default database for backend and `agentporch status`, absent `DATABASE_PATH`, is `~/.agentporch/agentporch.db`, not an installation-relative `server/database/agentporch.db`. The legacy filename remains intentional because it contains application state beyond authentication. Coverage: `tests/specs/project-index-db-backed.spec.ts`.

## Requirements: load details on demand

The project page, sidebar expansion, and route restoration obtain recent sessions and workflows through `GET /api/projects/:projectName/overview?projectPath=...`. It returns that project's recent Codex sessions and oz flow workflow summaries, associates provider sessions by project path, and never requires returning details for every project.

`useProjectsState` owns React state/effects, API calls, and its public return shape. Route selection is in `frontend/hooks/projects/projectRouteSelection.ts`, covering old `/session/:id`, manual `cN`, and workflow-child routes. The hook imports that module rather than retaining route regexes and lookup rules. Summary/overview merging belongs in `projectRefreshReducer.ts`; provider-session collection and insertion belong in `projectSessionCollections.ts`. Summary refresh cannot overwrite loaded detail. Optimistic `cN` sessions can be replaced by their real provider sessions without changing navigation behavior.

Coverage: `tests/specs/project-refresh-coordination.spec.ts`, `tests/unit/project-routing-refresh.test.ts`, and `tests/spec/project-workspace-navigation.spec.ts`. Default Vitest coverage includes cN and legacy routes, workflow children, provider ownership, and visible sessions.

## Requirements: project domain boundaries

`backend/domains/projects/` owns discovery, configuration read models, manual routes, overview, deletion, and search. `backend/projects.ts` remains a compatibility facade/dependency assembly point; it does not implement provider filtering, route counters/binding, deletion, or search. `project-domain-service.ts` is an aggregation facade rather than a replacement monolith. Coverage: `tests/specs/backend-type-module-boundary.spec.ts`.

Manual-route read models/session-route stores own route indexes, `providerSessionId`, and runtime reads/writes when `cN` drafts are bound and finalized. Preserve reading and cleanup of legacy configuration keys.

Discovery does not deeply read all JSONL message bodies. A dedicated search service reads actual provider transcripts. Given real Codex JSONL and project registration in a temporary HOME, `searchChatHistory` finds a unique business phrase and returns `sessionId`, `projectName`, `provider`, and matched text. Coverage: `tests/specs/project-domain-business.spec.ts`. A deletion service coordinates Codex/Pi session removal, empty-project removal, and archive-index cleanup.

`backend/domains/projects/provider-session-list-read-model.ts` owns `buildProviderSessionListReadModel`, called by `projects.ts`. A provider session bound to a manual `cN` route appears once through that clickable route, retaining `routeIndex` and `providerSessionId`; its underlying session is not listed again. With workflow-child filtering enabled, workflow-owned sessions are absent from ordinary manual lists while unrelated sessions remain. Coverage: `tests/specs/provider-session-list-read-model.spec.ts`.

## Requirements: responsive startup

The default list cannot wait for workflow watcher readiness, global workflow attachment, or full provider-history indexing. Heavy work runs in background or in the individual project's detail path. HTTP begins listening before provider watchers initialize. Directory creation, history traversal, readiness timeouts, or initialization failures cannot delay `/health`; failures affect live refresh and are logged.

Network evidence distinguishes summary requests from individual overviews; runtime evidence proves watcher registration and detail loading do not block the initial project list. Default list responses contain no workflow/batch fields.

## Requirements: refresh coordination across windows

When visible and hidden windows receive the same `project_list_invalidated`, the visible window owns refresh and calls `/api/projects`. The hidden window does not duplicate the heavy request. Each scope/version has exactly one refresh owner. Followers apply the owner's broadcast snapshot without fetching the list. A newer invalidation cannot reuse an older snapshot.

## Requirements: backend read coalescing

Concurrent reads of the same business scope execute one actual task and receive the same result. After that promise settles, the next read runs a new task. Distinct scopes such as `projects:list`, project overview, workflow details, and search remain independent and can execute concurrently. Same-query/scope searches, overviews, and workflow reads are coalesced or follow an explicitly bounded reading policy. Failures are not cached after settlement; subsequent calls can retry. This protects against failed frontend coordination and requests from separate browser profiles.
