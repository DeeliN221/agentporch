# Specification: provider indexing and session sources

## Requirements: lightweight authoritative discovery

Project discovery uses bounded provider metadata, never full transcript parsing for a repository list. The current default `/api/projects` response comes from SQLite summaries; the discovery rules below apply to background backfill and individual-project overviews, as defined by [project summaries](project-list-summary-api.md).

Codex discovers cwd from the first nonempty `session_meta` record's `payload.cwd` in `~/.codex/sessions/**/*.jsonl`, without reading subsequent messages or large tool output. An old-format file without that header can use the existing full-parser fallback for that file only, without blocking normal-header files.

Pi JSONL discovery uses the first nonempty `type: session` record's `cwd` in `~/.pi/agent/sessions/**/*.jsonl`. The supported Pi SQLite discovery path reads `pi.db`'s `session.directory` without invoking `pi session list --format json` or scanning snapshot, tool-output, or session_diff directories. Missing/incompatible/unreadable Pi DBs can fall back to the existing CLI path; CLI failure produces an empty Pi index, not failure of the entire project list.

Claude backfill reads usable metadata containing cwd, sessionId, and timestamps from `~/.claude/projects/<project>/<session>.jsonl`. A malformed later row or large tool output cannot break discovery. Overview data preserves `claudeSessions`, provider, and provider session ID. Claude HOME scanning is not part of the default lightweight list request.

Watcher/backfill processing of provider-file additions, modifications, and deletions updates both `provider_session_index` and `project_index`, emitting `project_list_invalidated` when visible projects change. Direct children of the system temporary directory named `agentporch-pi-*` are excluded from visible projects. Coverage: `tests/specs/project-index-db-backed.spec.ts`.

Discovery cost follows file/index-record counts, not total transcript bytes. Concurrent builds reuse one in-flight promise rather than rescanning Codex/Pi or querying the Pi database again within the same request wave.

## Requirements: stable overview identities

Each provider has its own correctly labeled session collection in project overviews; sessions are never reassigned to Codex by fallback. Project displayName and favorite/pending/hidden session state are overlaid from configuration, and hidden sessions remain hidden by default. Workflow-owned children stay out of normal manual groups but remain accessible through the workflow read model.

Opening an indexed Codex session reads its real JSONL history regardless of approximate overview message counts. Pi detail uses the matching native provider data source, never Codex JSONL and never a resurrected co read model. SQLite-derived session summaries do not require pre-reading complete message/part tables.

Claude history is read only when explicitly requested with a limit or cursor. Reads are bounded and preserve user/thinking/tool-call/tool-result/final-answer order; metadata and sidechains do not become visible messages. Entering the TUI does not prefetch history.

## Requirements: manual lists reflect actual provider sessions

Codex/Pi command-line JSONL sessions appear in their respective manual lists even without a AgentPorch `cN` route or `origin=manual` metadata, unless current workflow metadata proves they are workflow children. Explicitly owned children are filtered. After `oz flow clean`, stale metadata referencing a deleted child must not hide unrelated command-line sessions that still exist.

## Requirements: native manual runtime and user-message recovery

Codex manual messages create/resume native app-server sessions and forward structured events. Pi messages create/resume native `AgentSession` instances and forward their events. Neither writes `co-request-v1`, continues old co conversations, nor uses co requests/conversation/read models as current session sources.

Completed user/assistant/tool history reloads from provider-native transcripts after refresh. Pending user messages remain visible during active requests through the native runtime snapshot. A persisted confirmation of the same request replaces its optimistic bubble and clears pending/failed state rather than duplicating it. Distinct request IDs with identical text remain separate sends, and multi-turn histories preserve user/assistant order.

Older requirements for reading requests from co `done`, `claimed`, or `running` buckets and associating them through `state.json.request_id` are superseded by native runtime recovery. They explain the user-message regression being protected, not a requirement to restore retired co storage. Existing co conversations are neither migrated nor exposed as new sessions.

In-flight input follows native capabilities. Pi steering enters the steering queue after the current tool finishes and before the next LLM call; follow-up waits until the run has no remaining tool calls or steering messages. For Codex, the earlier queue-only limitation is superseded by [native app-server steering](codex-app-server-steer.md); implement the current explicit capability contract, not a generic co-steer wrapper.

Stopping aborts the native run and clears active-run state. A subsequent send starts a fresh provider turn and does not reuse the aborted runtime state.

## Requirements: read-only profile-scoped Hermes history

Hermes `state.db` is a read-only source restricted to allowed local homes. Session identity combines profile scope with the original session ID, preventing collisions across profiles and providers.

Backfill and database/WAL/SHM watchers use read-only SQLite connections: no migration, checkpoint, journal-mode change, or database writes. Only visible top-level logical project sessions become normal cards. Archives, delegates, and compression ancestors stay hidden; unassigned sessions enter only a read-only unassigned collection. A bad profile or incompatible schema emits diagnostics without blocking other profiles.

Read active compressed-session messages from root to tip, normalizing reasoning, tool calls/results, and structured text into stable ordered message keys. Do not expose system prompts, model configuration, API content, or local media-file content. Frontend stores Hermes in a separate `hermesSessions` bucket. Unknown providers fail safely instead of degrading to Codex.

Hermes permits list/history reads only. Create, send, rename, delete, live subscription, status queries, and terminal restoration capabilities are all false. Coverage: `tests/backend/hermes-session-read-model.test.ts` and `tests/specs/hermes-readonly-provider.spec.ts`.

## Validation commands

- `pnpm exec tsx --test tests/backend/provider-session-index-store.test.ts`
- `pnpm exec tsx --test tests/specs/provider-session-list-read-model.spec.ts`
- `pnpm exec tsx --test tests/specs/hermes-readonly-provider.spec.ts`
- `pnpm exec tsx --test tests/specs/provider-runtime-boundary.spec.ts tests/specs/project-index-backfill-selection.spec.ts`

See also [provider runtime events](provider-runtime-events.md).
