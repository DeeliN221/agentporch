# Codex app-server history, ordering, and recovery

## Tests

- `pnpm exec tsx --test tests/specs/codex-history-message-order.spec.ts`
- `pnpm exec tsx --test tests/specs/codex-app-server-protocol-mapping.spec.ts`
- `pnpm exec tsx --test tests/specs/provider-runtime-boundary.spec.ts`

## Requirement: Paginate conversation content with stable raw-line cursors

A rollout may contain user, assistant, reasoning, tool-call, and tool-result records without one-to-one correspondence between lines and UI messages. Older-history requests use the backend cursor and nonoverlapping raw-line ranges. Merging pages preserves user-turn order and assistant/tool context without duplicates.

Collapsed reasoning and tool records do not consume the conversational page quota. Tool-heavy pages must still reach at least one user question and assistant conversation content.

## Requirement: Exclude provider-internal roles

The Codex messages endpoint must not expose developer/system/bootstrap messages, turn context, or environment instructions. Such internal content must not incorrectly consume visible conversation pagination.

## Requirement: Preserve turn order and deduplicate user echoes

When response_item user messages and event_msg user_message both record one input, show it once before that turn's assistant/tool responses. Do not accumulate user bubbles at the end of the transcript.

## Requirement: Exercise real manual-session entry points

Prepare actual JSONL in isolated Playwright HOME, open the fixture project's real cN route, and submit the second turn through the textarea and send button. Assert codex-command carries the current cN identity and verify visible `.chat-message` order, not merely pure-function output.

## Requirement: Tolerate code fences adjacent to non-Latin text

An opening fence immediately following Chinese prose must begin a code block while preserving the prose as ordinary text. A closing fence immediately followed by Chinese prose must end the block and keep the following prose outside it. With both boundaries adjacent, render one block in the correct reading order and show no raw fence markers.

Already-valid fenced Markdown must preserve code, language, and newline structure. Inline triple-backtick command examples on one line remain inline rather than being converted to blocks. Unicode regression fixtures deliberately exercise Chinese text.

## Requirement: Use the app-server runtime boundary

Manual codex-command handling enters the Codex app-server facade. Production code must not import @openai/codex-sdk.

## Requirement: Centralize route/provider binding

WebSocket, messages API, completion reconciliation, and abort lookups all use provider-session-binding. Do not independently reconstruct binding fields in several modules.

## Requirement: Separate runtime recovery lifecycles

Active-turn overlays and live snapshots have distinct cleanup lifecycles across refresh, completion, abort, and errors. After actual completed JSONL becomes readable, the live snapshot is no longer authoritative history.

Additional tests: provider-runtime-boundary.spec.ts, codex-app-server-protocol-mapping.spec.ts, codex-app-server-steer-runtime.spec.ts under tests/specs, and tests/spec/pi-provider-integration.spec.ts. Evidence: test-results/provider-runtime/source-audit.json, binding-state.json, and active-turn-runtime.log.
