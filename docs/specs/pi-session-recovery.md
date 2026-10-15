# Pi message recovery and persisted ordering

## Tests

- `pnpm exec tsx --test tests/backend/pi-session-messages-endpoint.test.ts`
- `pnpm exec tsx --test tests/specs/pi-session-message-order.spec.ts`
- `pnpm exec tsx --test tests/manual/node-history/pi-session-message-recovery-contract.test.ts`

## Requirement: Recover complete messages after refresh

Completed sessions restore all history bubbles, preferring JSONL. A live snapshot bridges only the interval before JSONL is ready. Running sessions also restore completed user/assistant messages and obtain active transcript data from getNativeSessionLiveTranscript.

An empty liveMessages array must not cause handleGetSessionMessages to return empty prematurely. Distinguish absence using `liveSnapshot !== null` and continue providerSessionId and completed-snapshot fallback paths when the live array has no messages.

If a completed turn has a provider binding but getPiSessionMessages returns no messages because JSONL is not ready, use getPiSessionCompletedSnapshot. Return available snapshot messages marked live-snapshot-bridge, normalized through normalizeLiveMessageToJsonlShape.

## Requirement: Persist and restore DeepSeek reasoning

For DeepSeek reasoning_content, Pi SDK thinking_delta events must be written to JSONL as `type: 'thinking'` content parts when the turn ends. Completed history returns all reasoning blocks with isThinking=true, matching the streamed content without truncation.

During a running-session refresh, load existing JSONL first, then merge any live snapshot. Preserve all already-generated reasoning and tools. Later WebSocket events append without replacing or duplicating recovered content.

Use mergeAndDedupMessages with messageKey and content fingerprints. normalizeLiveMessageToJsonlShape converts live ChatMessageLike values to the wire shape. makeMessageFingerprint reads both msg.message.content and msg.content.

## Requirement: Keep live and persisted order identical

For thinking A, toolCall B, toolResult B, thinking C, then text D, render that order. Do not append thinking C into thinking A and visually move the tool card. Refresh or projects_updated must preserve relative order without duplicate tools or assistant text.

## Requirement: Use stable provider identities, not textual similarity

Two deliberately repeated user inputs remain two turns, including their independent assistant, reasoning, and tool responses. Do not merge them because the text matches or timestamps are close.

When several parts share an assistant JSONL timestamp, order by line number and content-part index rather than sorting by timestamp.
