# Specification: provider runtime live events

This contract covers native events, JSONL reconciliation, configuration metadata, and message-type flags.

## Requirements: native events drive live messages

`backend/domains/provider-runtime/runtime-router.ts` is a public facade and coordinator. Event conversion belongs in `provider-event-mappers.ts`; session lookup, status, and abort state belong in `runtime-session-store.ts`; fake runtimes and harnesses belong in separate modules. Do not move their implementations back into the facade. `tests/specs/backend-realtime-boundary.spec.ts` writes its audit to `test-results/backend-realtime-boundary/source-audit.json`.

A Codex `agent_message` received over WebSocket must become visible before its JSONL is readable or complete. Updates for one `itemId` update that message instead of adding bubbles. Pi text deltas for one `messageId` similarly form one assistant message without repeatedly fetching `/messages` to see live content.

File-operation protocol JSON delivered as `data.type: item`, `itemType: agent_message` must not enter prose. Payloads describing file add/update/write operations must not appear as raw JSON, a `JSON Response` block, or file contents passed off as an assistant answer. Actual assistant prose and user-requested business JSON must remain visible, including after persisted-history restoration. Use the existing JSON renderer for genuine JSON answers.

`frontend/components/chat/utils/providerPayloadParsers.ts` supplies the single typed parser for provider file updates and Codex tool updates. `messageTransforms.ts` and `sessionMessageMerge.ts` reuse it without private parser copies. `tests/specs/chat-tool-message-types.spec.ts` writes `test-results/chat-tool-message-types/source-audit.json`.

The first visible batch of Codex/Pi text has a target latency of at most **100 ms**. Coalesce later high-frequency deltas at a slower cadence to bound WebSocket frames and repainting. Flush outstanding text and clear timers before completion, abort, or runtime disposal.

## Requirements: JSONL is persisted history

After a turn persists, final history reconciliation replaces or confirms live messages without duplicate or reordered user, assistant, or tool rows. Frontend native-transcript rendering and backend active-turn/live-snapshot stores share the pure reducer and types in `shared/provider-runtime-transcript.ts`. Backend runtime modules cannot import `frontend/components/chat/*`; stores cannot bypass the boundary with `@ts-nocheck`.

Large sessions initially load only the latest window. Earlier messages load on upward scrolling or explicit request; mounted DOM rows remain bounded.

## Requirements: configuration contains metadata only

Do not write `pendingUserMessages`, `pendingProviderSessionId`, `startRequestId`, or `cancelRequested` into XDG `conf.json` when sending messages. Refresh recovery uses native runtime snapshots or provider JSONL. Legacy `<project>/.agentporch/conf.json` is neither created, read, nor updated; project configuration uses XDG state.

Cancellation of slash-command requests during refresh, navigation, unmount, or browser cancellation is expected lifecycle behavior. It produces neither `Error fetching slash commands` console errors nor visible error notifications, and QA can distinguish it from a network failure. HTTP 5xx, authentication errors, and non-cancellation network failures from `/api/commands/list` retain diagnostics or a recoverable state; they cannot be misclassified as cancellation.

## Requirements: obsolete co compatibility

Production code must not include `backend/co-client.ts`, `backend/co-read-model.ts`, or co request/state/event compatibility entry points. Manual chat must not read `AGENTPORCH_CO_HOME`, `co-request-v1`, or `co-conversation-v1`. Startup/migration cleanup idempotently removes legacy `${XDG_STATE_HOME}/agentporch/co` without removing native provider history such as `~/.codex` or `~/.pi`.

## Requirements: live and persisted type parity

Pi `thinking_delta` and Codex `reasoning` reduced by `reduceNativeRuntimeEvent` produce `type: assistant`, `isThinking: true`, and merged thinking content. `MessageComponent` renders this using `<Markdown>` with the assistant font size and color, without gray side borders, extra indentation, or italic dimming.

Pi `tool_call` and `tool_result` produce `type: assistant`, `isToolUse: true`, and populated `toolName`, `toolInput`/`toolResult`. `MessageComponent` uses `ToolRenderer`, without a generic wrench icon or tool label. Native-live-transcript regressions must not assert obsolete `type: reasoning` or `type: tool` values.

## Validation commands

Run each with `pnpm exec tsx --test`:

- `tests/specs/provider-runtime-boundary.spec.ts`
- `tests/specs/backend-realtime-boundary.spec.ts`
- `tests/specs/provider-live-non-streaming-render.spec.ts`
- `tests/specs/codex-live-transcript-rendering.spec.ts`
- `tests/specs/chat-tool-message-types.spec.ts`
