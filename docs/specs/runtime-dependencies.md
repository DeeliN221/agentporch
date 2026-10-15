# Specification: runtime diagnostics and manual sessions

## Requirements: event-driven refresh

After initial message/status loading, an authenticated idle session must remain usable for **eight seconds** without periodic `check-session-status`, new browser navigation, or interrupted input. WebSocket reconnection may perform one calibration for the active session but cannot start permanent business polling. Connection-health heartbeats remain allowed.

Workflow details refresh from backend watcher events or user actions. A planning workflow whose child has not yet appeared can show waiting state, but cannot request `/api/projects` every second while awaiting `workflow_changed` or `session_changed`. Go runner details similarly do not poll once per second; a workflow event refreshes that workflow only.

Transcript additions are session-scoped. A change to session Y in the same or another project must not force the page viewing X to reload `/api/projects`, clear its transcript, change scroll position, or interrupt input. Project addition/deletion/rename/project-configuration changes may produce low-frequency structural invalidation.

Recovery after creation or submission may use a finite number of session/workflow-specific calibrations. Stop after success, the retry limit, or leaving the page; infinite business intervals are prohibited.

## Requirements: consecutive turns, steering, and recovery

Idle Codex/Pi manual sessions accept second and later messages using the same stable `cN` route and correct provider. New assistant responses become visible without replaying earlier responses. Running sessions support explicit native steering and visible results according to [Codex steering](codex-app-server-steer.md) and [Pi input](pi-session-send-followup-steer-refresh.md). A rejected steer/message clears pending state, shows a recoverable error/system notice, and never leaves the composer permanently submitting.

Historical co `conversation_id`, `active_policy=queue/steer`, and `target_turn_id` requirements described these behaviors in a retired transport. Current implementations use native provider sessions and active-turn identity, not co request files. Likewise, refresh recovery and provider isolation use native transcripts/runtime snapshots rather than co conversations.

After two completed turns, reopening or refreshing shows both user messages and both assistant responses exactly once. Similar provider session IDs or route indexes cannot mix Codex and Pi history.

Pi deltas from one response accumulate into continuous prose rather than separate bubbles such as `Let`, ` me`, and ` first`. Distinct responses in one turn remain ordered after the user message. An intermediate completion followed by further same-turn output is not a whole-run termination: stopping remains available and later output stays in the same transcript. Stale active state after provable terminal events must resolve to an idle follow-up or a visible recovery/wait notice, never a silently discarded send.

## Requirements: stable manual routing

A bound Pi session appears once under its `cN` route; its native session ID is an association field rather than a duplicate entry. Route allocation starts after the maximum of existing `chat.N` routes, manual drafts, and `manualSessionRouteCounter`. If `chat.1` and `chat.2` exist but the counter is stale, subsequent drafts cannot reuse `c1` or `c2`, and the counter advances to the latest allocation.

Before finalization, a draft `cN` has no `providerSessionId`, so runtime starts a genuinely new provider session. Finalization binds `chat.N.sessionId` to the real native ID; later route lookup resumes that session.

## Requirements: bounded history and scoped updates

A message request with `limit` returns the newest tail window in chronological order, not the beginning of a long history. Pagination `offset` counts newest messages already skipped, returning the preceding older window without repeating the current one.

A change to the viewed session emits scoped `session_changed` and refreshes only its message endpoint. Growth of an existing assistant message must update the tail even if message count is unchanged; the frontend replaces/merges content. Users do not need a full page refresh. Idle sessions do not poll messages or business status periodically.

## Requirements: Pi model and thinking controls

Pi selection exposes a model control showing the current model. Selecting an available model updates session model state and the next send. Reasoning models expose supported thinking levels, excluding entries mapped to `null` in `thinkingLevelMap`; non-reasoning models allow only `off`.

Changing thinking depth updates `piThinkingLevel`, persists `thinkingLevel`, and includes it in the next send. For example `high` remains `high`; saving `xhigh` persists it, and reopening a session with `medium` restores `medium`. Codex's independent `reasoningEffort` behavior remains unchanged.

WebSocket `pi-command` options include `model` and `thinkingLevel` (for example model `anthropic/claude-sonnet-4-5` and depth `high`), never using Codex-only `reasoningEffort` to represent Pi depth. The server passes both unchanged into `sendNativeMessage({ provider: 'pi' })`.

A new Pi runtime applies model/depth through `createAgentSession()`. An existing idle runtime applies changes with `setModel()`/`setThinkingLevel()` before prompting. While streaming, input uses native `streamingBehavior: steer` or `followUp` queues without forcibly changing the active turn's model/depth.

Pi SDK `queue_update` becomes `session-queue-state` containing `steering` and `followUp` arrays. The UI makes clear whether running input steers now or queues a later follow-up.

## Validation commands

- `pnpm exec tsx --test tests/backend/runtime-dependencies.test.ts`
- `pnpm exec tsx --test tests/spec/runtime_readiness.ts`
- `pnpm exec tsx --test tests/backend/pi-cli-diagnostics.test.ts`
