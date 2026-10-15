# Chat submission and visible runtime state

## Requirement: Keep composer and session rules modular

Public `useChatComposerState.ts` and `useChatSessionState.ts` remain lightweight composition. Specialized modules under `frontend/components/chat/composer/` and `frontend/components/chat/session/` own input, attachments, submission, model control, loading, scroll anchors, and recovery. Production paths must import those modules rather than leave unused boundary files.

Preserve attachment limits, size checks, deduplication, upload errors, and cleanup. Preserve Codex steer, Pi follow-up/queue, optimistic user messages, and duplicate-submit behavior. Asynchronous catalog loading must not overwrite user choices; unchanged selections must not send model-state PUTs.

Long-history loading, prepending, delta appends, terminal reconciliation, and completed-turn refreshes must preserve order without duplication. Multi-token fuzzy file search, @ mentions, keyboard selection, and slash-command loading remain usable.

## Requirement: Submit with Ctrl/Meta+Enter only

In a real manual-session page, plain Enter retains the draft and inserts a newline without sending codex-command/pi-command or adding a user bubble. Ctrl+Enter and Meta+Enter each send exactly one command for the active provider and clear the textarea. The send button remains functional.

## Requirement: Do not expose sendByCtrlEnter settings

Appearance, agent, and diagnostic settings must not show the retired sendByCtrlEnter toggle or "Send by Ctrl+Enter" setting. Users cannot restore plain-Enter submission through that setting.

## Requirement: Keep active cN sessions visible and cancellable

When session-status carries a provider sessionId plus the active cN in agentporchSessionId/agentporch_session_id, show that turn's live output and the stop button. Stop sends abort-session for the active route or bound provider ID, never another session.

An empty messages response while persistence is pending must not remove live assistant/tool cards. Merge later persisted messages by identity.

An accepted follow-up shows `data-delivery-status="persisted"` and the green delivered style before JSONL catches up. Its live assistant output remains visible across an empty-history refresh.

## Requirement: Open tool-file paths in the real workspace

Clicking a view_image path opens its actual workspace image preview. Read/Edit paths open the actual text or diff context. Keep interactive path controls and pass the original path to the open operation.

## Requirement: Time active turns from the backend anchor

Codex/Pi processing status includes the backend-recorded turnStartedAt. Steer and follow-up messages must not replace the current turn start. check-session-status after refresh returns the same timestamp rather than using reload or mount time.

While loading, show chat-active-turn-indicator above the composer. chat-active-turn-elapsed uses Date.parse(turnStartedAt); status phrases may refresh every second without moving the anchor. Completion, failure, cancellation, or isProcessing=false clears the timestamp and removes the indicator.
