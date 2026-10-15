# Specification: Chat message merge core

The merge core maps persisted, live and optimistic rows to their original turns. Arrival order must not determine transcript order.

## Requirements: Acceptance matrix

| Requirement | Scenario and assertion | Test and production entry | Evidence and remaining risk |
| --- | --- | --- | --- |
| Stable turn order | A first-turn persisted user echo returned last stays in the first turn and appears once | `tests/specs/chat-message-merge-core.spec.ts`; `mergePersistedAndOptimisticMessages` | Real merge function and three-turn Codex samples; missing backend turn IDs require stable fallback ordering |
| Persisted final replaces live copy | One final assistant replaces the same-turn live draft without moving it below the next user | Same merge test and entry | Previous UI rows plus persisted replay; draft commit policy is covered by the streaming protocol |
| Out-of-order history | Restore user/assistant order using business timestamp, turn anchors and provider line order | Same merge test and entry | Real persisted shapes and Codex line order; providers missing sequence, rowid, timestamp, shared turn identity and provider order permit only limited inference |
| WebSocket turn ownership | `message-accepted`, `codex-response` and `codex-complete` share request identity | Merge test and `tests/specs/codex-ws-turn-ownership.spec.ts`; WebSocket handler | Real Chat messages, Codex items and REST samples; browser regression must cover provider field differences |
| Stale REST refresh | Old echoes return to the original turn, never the bottom | Merge test; Chat message refresh | Three persisted turns plus previous live rows; depends on stable turn identity |
| Idempotent WebSocket replay | Duplicate item creates no second assistant/tool bubble and never reorders users | WebSocket ownership test and handler | Repeated fake WebSocket item; missing item ID needs fallback identity |
| Accumulating drafts | Running/in_progress deltas accumulate in one visible live assistant; final output appears once | `tests/specs/codex-stream-stability.spec.ts`; `reduceNativeRuntimeEvent`, `filterRenderableMessages` | Native Codex delta/completed shapes; frontend reducer/render boundary only |
| Empty persisted row | Stale empty assistant cannot erase nonempty same-turn live draft | Merge test and entry | Stale then final persisted refresh; depends on turn inference |
| Incremental merge | Append converts only new raw rows, retains old UI object references and deduplicates `messageKey` | Merge test; `mergeSessionMessageDelta` | Real ChatMessage fields/provider deltas; hook orchestration is a separate integration boundary |
| Pure reducer | Hooks do not implement transcript splicing or accept arbitrary updaters | Merge test; `chatMessageReducer`, `useChatRealtimeHandlersImpl.ts`, `useChatSessionState.ts` | Production source and all 13 current `ChatMessageAction` branches; new provider shapes need new actions/fixtures |
| Delivery state machine | Accepted optimistic user immediately becomes persisted | Merge test; `deliveryStatusMachine`, `chatMessageReducer` | Real reducer/state machine; legacy missing status displays as persisted |
| Live before JSONL | Accepted user and live content survive an empty persisted reload | Merge test; `liveTurnMergePolicy`, session merge/state hook | Production paths; provider disk latency is outside frontend control |

## Requirements: Turn ordering and replacement

Given three previous UI turns, when REST returns the first user echo at the end, merging MUST restore its original position without duplication. Same-turn persisted final assistant MUST replace live draft and MUST NOT move below the next user. Out-of-order history MUST use business timestamps, turn anchors and provider line order, including equal timestamps and assistant shapes missing explicit anchors.

Given three Codex requests, accepted/response/complete events MUST retain stable request identity, keeping each assistant after its own user. If the third live turn is already visible and REST returns a first-turn echo, the bottom MUST remain third-turn content. A repeated `codex-response` item MUST appear only once as assistant or tool and MUST NOT reorder users.

## Requirements: Streaming and persistence lag

Running/in_progress `agent_message` deltas MUST accumulate in one live assistant row without erasing earlier text. A completed/final event MUST produce one stable final body without intermediate token rows. Transient drafts are distinct from stable persisted history; unfinished fragments MUST NOT become separate committed history rows.

Given a nonempty same-turn `codex-live` draft, an empty persisted assistant MUST preserve the draft and MUST NOT render an empty bubble. A later nonempty persisted final MUST remove the draft and display once.

Accepted Codex/Pi users MUST immediately transition to `deliveryStatus: "persisted"`. Pending failure, accepted success and persisted-echo replacement MUST all use `deliveryStatusMachine`; scattered status-string transitions in reducer branches are prohibited. Live assistant, tool and thinking events arriving before `/messages` or JSONL MUST appear after the accepted user. A subsequent empty persisted reload MUST preserve that user and its live content.

## Requirements: Incremental and reducer boundaries

When only raw rows after `afterLine` arrive, `mergeSessionMessageDelta` MUST convert/append only new rows, retain existing UI message object references and ignore duplicate `messageKey` values.

Hooks may subscribe, normalize events, assemble arguments and perform effects. Transcript append, replacement, deduplication, stream completion and error insertion MUST live in the pure reducer. Reducer/state/realtime modules MUST exist without TypeScript suppression. `useChatRealtimeHandlers.ts` MUST remain a thin re-export, and implementations MUST NOT bypass the reducer with `applyUpdater` or arbitrary transcript-updater closures.

Direct action tests MUST cover every current `ChatMessageAction` branch: user send and persistence, streaming chunks, assistant append, tool calls/results, errors, pending-user failure, REST reload, delta append and live runtime events. Assert stable transcript ordering, error deduplication and result attachment to the original tool.

## Requirements: Contract tests

Run each file with `pnpm exec tsx --test <path>`:

- `tests/specs/chat-message-merge-core.spec.ts` imports `frontend/components/chat/utils/sessionMessageMerge.ts` and production reducers with real `ChatMessage` fields. Assert visible-text order, same-timestamp anchoring, fallback provider ordering, three-turn late duplicates, empty-refresh preservation, final replacement, stable references and reducer/state-machine boundaries.
- `tests/specs/codex-stream-stability.spec.ts` imports `frontend/components/chat/utils/nativeRuntimeTranscript.ts` with real Codex item shapes. Assert one accumulating transient draft and one completed stable body, without token-level duplicate rows.
- `tests/specs/codex-ws-turn-ownership.spec.ts` uses the same production live reducer and Codex item shapes. Assert stable accepted/response/complete identity, one visible running `command_execution` card and idempotent repeated assistant/tool events.
