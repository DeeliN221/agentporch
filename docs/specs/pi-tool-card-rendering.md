# Specification: Pi tool cards and thinking blocks

This contract covers shared Pi/Codex cards, thinking, event order, command output and Edit inspection.

## Test entry points

Run `pnpm exec tsx --test <path>`:

- `tests/e2e/pi-session-input-tool-rendering.spec.ts`
- `tests/manual/node-history/pi-tool-card-rendering-contract.test.ts`
- `tests/manual/node-history/pi-thinking-block-render-contract.test.ts`
- `tests/specs/chat-tool-message-types.spec.ts`

Default Vitest coverage also includes `tests/unit/chat-tool-runtime.test.ts`.

## Requirements: Card structure and output

Pi tools MUST use the shared Codex-style renderer. Bash execution MUST expose its command, running/error state and inspectable input/output. Read MUST use file-path/content-preview configuration rather than a bash-style wrapper.

The original contract used an expanded outer card while running and after live completion (`exitCode` present/status no longer running), with manual collapse and refresh-stable state. The current layout refines that interaction: an outer `<div>`, never outer `<details>` or `data-collapsed`, keeps the command/path summary visible; the independent output region owns folding. Running tools retain a spinner or Running status, including after refresh. Historical assertions about outer `data-collapsed="false"` describe the previous layout, not an additional current DOM requirement.

Completed Bash/Read/Grep/error output MUST live in its own `<details>` with an Output summary and no default `open` attribute. Stdout/stderr, read contents, grep results and error output remain hidden until expansion. A link to `#tool-result-{toolId}` MUST scroll to the target and automatically expand its output.

MessageComponent MUST NOT add a redundant outer `bash`, `Tool` or tool-name heading. Concrete ToolRenderer cards own commands, parameters, output and errors; removing headings cannot hide commands/running state.

Commands such as `pnpm test` MUST be directly visible without opening outer details or a chevron in the tool-label header. Output remains collapsed within the same card, never a second `Bash / Output` or `exec_command / Output` group. Pi MUST use the same structure as Codex. A generic extra `Result` row is prohibited, but `tool-result-*` anchors and inspection remain. Failure text/status must stay visible or expandable without restoring generic Result labels.

The later label rule also removes internal Read, Edit /, standalone Edit, exec_command and functions.exec_command group names from visible primary labels. Paths, filenames, commands, diffs and output controls remain visible. Removing names MUST NOT add duplicate cards or restore outer tool headings.

## Requirements: Configuration families

Tool lookup MUST normalize lowercase Pi SDK names such as bash/read/write through case-insensitive, initial-capital matching in both `getToolConfig` and `getToolCategory`. Vitest MUST cover Bash/bash fallback, context-mode MCP prefix normalization, hidden-result rules and exec-result content extraction.

`frontend/components/chat/tools/configs/toolConfigs.ts` MUST remain a registry/compatibility export rather than a giant configuration file. Shell, file, Codex and subagent families MUST have separate modules documenting their business purpose and reviewable exports. Tool configuration entry points MUST NOT contain `TODO TOOLS` remnants.

Specification test: `tests/specs/chat-tool-message-types.spec.ts`; audit artifact: `test-results/chat-tool-message-types/source-audit.json`.

## Requirements: Thinking presentation

Codex/Pi standalone reasoning/thinking MUST show readable body text without a redundant thinking heading, gray left border, extra indentation or italic de-emphasis. Font size/color MUST match assistant body. `showThinking` controls only inline assistant `message.reasoning`; it MUST NOT globally hide standalone thinking messages, and `shouldHideThinkingMessage` global suppression is prohibited.

Pi thinking longer than three lines MUST default to its latest three lines with `thinking.expand` / `thinking.collapse` controls. Expansion shows all text and survives streaming updates while `messageKey` is unchanged. At most three lines needs no expand/collapse control.

## Requirements: Thinking/tool separation and ordering

A `tool_execution_start` received as `pi-response` itemType `tool_call` MUST create a separate ToolRenderer card, never text inside a thinking block.

In Pi history, `mapPiEntryToMessages` MUST map content type thinking to `isThinking: true` and toolCall to `isToolUse: true` separately. It MUST support standard `item.type === 'thinking' && item.thinking`, DeepSeek `item.type === 'reasoning_content' || item.reasoning_content`, and separate `item.type === 'tool_use'` calls. This includes thinking_delta events represented as itemType reasoning with `isReasoning: true`.

Given `reasoning A -> command_execution bash -> reasoning B`, `reduceNativeRuntimeEvent` MUST preserve that order while running and after persistence/refresh. Reasoning B cannot merge backward across the tool. Input, running output and final result sharing `toolCallId`/`itemId` MUST update one original card, not create result duplicates.

Thinking blocks without stable item IDs MUST receive unique deterministic keys such as `provider:thinking-1` and `provider:thinking-2`. The provider sequence increments from existing thinking-block counts, remains stable across renders and cannot collide with keys for identified items. Codex/Pi `useChatRealtimeHandlers` live allowlists MUST admit itemType `thinking` and deliver it to the reducer.

Pi native JSONL assistant `content[]` defines provider order. For `text A -> thinking B -> text C -> toolCall D`, `/messages` and `getPiSessionMessages` MUST preserve that sequence without regrouping/merging text around other types. A later matching `toolResult D` MUST attach to D at its original location, never move the card past later assistant body.

## Requirements: Live tools before persisted refresh

Codex/Pi manual-session `tool_call`, `tool_result` and `command_execution` items MUST render before JSONL/read-model refresh. Codex `codex-response` with `data.type="item"` enters `reduceNativeRuntimeEvent` and creates an assistant `isToolUse=true` card. Pi call/result events MUST share one card and the same naming/input/output contract.

For Pi nested `data.item` metadata and the sequence `thinking A -> tool_call B -> tool_result B -> thinking C`, render A, one B card with real tool name/command/arguments, then C. Attach result B to that card and do not merge C back into A.

After a command_execution card displays `pnpm test`, a same-item delta containing only output MUST retain the command and add output to its collapsible region; it cannot erase the card or leave it empty. A temporary empty `/messages` response while persistence lags MUST preserve live assistant/tool cards until identifiable persisted rows arrive and deduplicate them.

## Requirements: Failure and repeat-action consistency

A model-state PUT returning 500 MUST log diagnostic warning `Failed to persist session model state: 500`.

If Pi off effort was persisted and a later high selection fails with PUT 500, reload MUST restore off, not the failed high value. Retrying a disconnected send MUST deliver that instruction once (`piCommandCount=1`). Rapid duplicate submission MUST remain one visible input after refresh.

## Requirements: Edit inspection

Opening an Edit card in either Pi or Codex manual sessions MUST show the old/new diff without pageerror, React runtime errors or console TypeError. Pi's path/filename stays visible so users can identify the target.

Clicking open/equivalent file action MUST open the editor sidebar or preserve inspectability. Passing `diffInfo` MUST tolerate missing fields, string payloads and provider differences without throwing.
