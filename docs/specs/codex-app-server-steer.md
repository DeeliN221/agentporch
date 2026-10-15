# Specification: Steering Codex manual sessions

## Requirements: Reasoning-effort selection

Given a new manual draft (`new-session-xxx` or `cN`, no history), selecting Low and sending MUST set `codex-command.options.reasoningEffort = "low"` and app-server `turn/start.effort = "low"`; the selector MUST remain Low. Reload/new-session initialization MUST restore the last selection from localStorage rather than overwrite it with High. Asynchronous model-catalog loading MUST NOT replace a manually selected Medium with `defaultReasoningEffort`.

## Requirements: Active-turn steering

After app-server `turn/started` supplies `threadId` and `activeTurnId`, additional user instructions while running MUST call `turn/steer` with the current provider thread ID, `expectedTurnId` equal to the verified active turn, and the instructions in `input`. They MUST NOT enter a queue for the next turn.

If a session claims to be running but no active turn can be verified, reject steering with a user-visible broadcast error, mark the optimistic user message failed and never silently queue it.

## Requirements: Protocol mapping and failure recovery

`item/agentMessage/delta` and `item/commandExecution/outputDelta` MUST broadcast `codex-response`. Preserve `itemId`, `itemType=agent_message` and incremental text for agent deltas; preserve `itemId`, `itemType=command_execution` and output fragments for command deltas.

Transport close/error MUST mark every affected running session failed in the session manager, broadcast a visible error through its writer and prevent later input from attaching to the failed active turn. In a runtime with concurrent sessions, notifications carrying `threadId` MUST update only the matching `providerThreadId`; deltas/completion cannot leak to another session.

Tests: `tests/specs/codex-app-server-protocol-mapping.spec.ts`, `tests/specs/codex-app-server-steer-runtime.spec.ts`. Diagnostic artifact: `test-results/oz-113-codex-app-server-runtime/protocol.log`.

## Requirements: Exclusive production runtime

All production Codex entry points, including `POST /api/agent`, MUST use the app-server runtime or a dedicated app-server runner, inheriting thread/turn identity, active-turn state, live transcript and steering. Production MUST NOT retain `backend/openai-codex.ts`, import old `openai-codex`, call `queryCodex` or construct `codex exec --json`. Active specs MUST NOT present those removed paths as current requirements.

Attachment/microphone handling MUST NOT call OpenAI Whisper/GPT HTTP APIs or import the `openai` npm SDK statically/dynamically. `package.json` MUST NOT directly depend on it, and frontend MUST NOT call `/api/transcribe-audio`.

Test: `tests/specs/provider-runtime-boundary.spec.ts`; artifact: `test-results/provider-runtime/source-audit.json`.

## Requirements: Window and session ownership

Codex/Pi deltas, lifecycle events and permission requests are session-private. Deliver them to the initiating window owner or an explicit matching session subscription. Shared user identity is an authentication boundary, not sufficient delivery scope.

With two windows A/B for one user, A's `codex-command` carrying `sessionId/agentporchSessionId/projectPath/provider/clientRequestId` MUST receive its delta, while unsubscribed B MUST NOT. Public project-refresh events may still broadcast to that user's windows.

Delivered deltas MUST include `agentporchSessionId`, `agentporch_session_id`, `provider` and `projectPath`. Opening/switching sessions MUST declare `subscribe-session`. B subscribed to `c2` MUST NOT receive A's `c1` private events merely because user/provider match. Subscription matching MUST equate at least one stable session identity: `sessionId`, `agentporchSessionId`, `providerSessionId` or `clientRequestId`.

Test: `tests/specs/codex-ws-turn-ownership.spec.ts`; artifact: `test-results/115-websocket-window-ownership/runtime-delivery-log.json`.

## Requirements: Terminal reconciliation and performance

Running app-server events are provisional live display. After completion, JSONL/read model is authoritative history. `turn/completed` MUST trigger terminal reconciliation, remove unmatched stale live tool cards and produce the same counts of users, assistant bodies and tools before/after a browser refresh. A tool already shown live and later persisted MUST remain one card with its result attached.

`item/started`, `item/agentMessage/delta` and `item/completed` MUST NOT broadcast full-list `projects_updated` or trigger frontend `/api/projects` refresh. Update only the live reducer or scoped session messages. `session_changed` and completion reloads MUST retain tail-window/`afterLine` incremental reads; do not parse complete JSONL on each event.

## Requirements: Restoring stop controls

After reopening/reloading a running Codex manual session, `check-session-status` with `isProcessing=true` MUST restore a stoppable state and the composer stop button. Clicking it MUST send `abort-session` addressed to the current `sessionId` or `agentporchSessionId`, with `provider: "codex"`.

## Requirements: Streaming text and protocol objects

Deltas for one `itemId` MUST append into one visible assistant body; later fragments cannot erase earlier ones or create separate bubbles. For the Unicode fixture `这是`, `一段`, `流式回答`, the intermediate accumulated text is `这是一段流式回答`. Once persisted final text arrives, retain exactly one copy, not live plus persisted duplicates.

Unknown/object-shaped `codex-response` payloads that are not readable text, tools or thinking MUST NOT display raw JSON or protocol fields such as `itemId`, `delta`, `content_part`. They MUST NOT clear existing users or assistant text.

## Requirements: File-operation normalization

Live and replayed assistant text may contain JSON file operations `add`, `edit`, `write` or `update`. A recognized operation with a path MUST become a file-operation tool card, without leaking provider envelopes or removing ordinary application JSON.

Acceptance cases:

1. A live `codex-response` with `data.type="item"`, `itemType="agent_message"` and operation JSON in `message.content` MUST show each file path in a `codex-tool-card`. Existing assistant text stays visible; raw fields, envelopes and `JSON Response` headings do not.
2. `data.itemType="file_change"` with `data.changes=[{"kind":"update","path":"src/live-update.ts"}]` MUST show a FileChanges card and that path, not ordinary body JSON containing `changes`, `kind`, `path` or `diff`.
3. Same-item fragments `{"type":"update",` then `"path":"src/split-update.ts"}` MUST resolve to only a FileChanges card once complete, removing the stale raw-text representation.
4. JSONL `response_item.message.content.output_text` containing the same operations MUST render cards after reload, never raw JSON or file-write contents as ordinary assistant body.
5. JSON missing a recognized file-operation type or path MUST remain ordinary assistant content/existing JSON rendering, not a file card.

## Requirements: Thinking classification

If an item is first represented as `agent_message` and later as reasoning, users MUST NOT see an ordinary-body-to-thinking style flash or duplicate body/thinking copies. `reasoning` and `thinking` MUST produce `ChatMessage.isThinking: true`, not `isToolUse: true`, and use the thinking renderer.

## Requirements: Stable multi-turn transcript

Local send, accepted events, live responses, stale read-model updates and completion refreshes MUST merge into a stable, idempotent transcript:

- With turn 1 persisted, duplicate `message-accepted` events for turn 2's same `clientRequestId` MUST leave one user bubble before its assistant.
- Duplicate live assistant items MUST leave one response after that user.
- If turns 2 and 3 are live while `/messages` still contains only turn 1, a `projects_updated` MUST preserve `user1 -> assistant1 -> user2 -> assistant2 -> user3 -> assistant3`, each once. Assistant text between user requests remains visible, even when turn 2 contains substantial output.
- When turn 2 catches up in persistence but turn 3 remains live, repeated refreshes MUST merge/replace turn 2's optimistic/live rows once, preserving turn 3 after it without reordering.
- When both turns persist, `codex-complete` or browser refresh MUST converge to final persisted content without stale live copies.
- Sending turn 2 in a `cN` session and receiving a new live `agent_message` MUST NOT clear turn 1's assistant body until completion/history reload. Turn 2's user stays above its assistant throughout.
- A completion reload with both turn-2 rows already in JSONL MUST yield `user1, assistant1, user2, assistant2`; user2 appears once and never beneath its own response.

## Requirements: Related specification

[Codex app-server history, ordering and recovery](./codex-app-server-history.md)
