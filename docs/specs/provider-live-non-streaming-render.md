# Specification: throttled provider live rendering

## Requirements

Codex `codex-response` and Pi `pi-response` envelopes drive visible live rendering through the production `nativeRuntimeTranscript.ts` reducer. An `agent_message` with `status: in_progress` and `delta.text` must immediately create one visible assistant message. Further deltas for its `itemId` accumulate in that message. A completed event containing full text replaces the draft without duplicating the final answer.

An unfinished Codex `function_call` or Pi `tool_call` must display its input before completion. Output with the same `call_id` or `toolCallId` merges into the same card, preserving both input and nonempty output; no output-only duplicate card is allowed. Empty or whitespace-only output must not produce a visible `toolResult`, an output disclosure, or blank space below the input.

Unfinished `reasoning` and `thinking` events must already render as `isThinking: true`, with deltas accumulated into the same item. Completion must retain that identity and produce exactly one thinking block, never a second ordinary-text copy. Thinking uses the same font size and color as assistant prose, without a gray left border, extra indentation, or italic styling.

Every provider item retains a stable `messageKey` through updates and completion. Thinking cannot overwrite ordinary assistant prose. Tool input and output share one identity. React duplicate-key warnings, repeated content, and replaced unrelated messages are regressions.

A locally submitted user bubble remains before all response text, thinking, and tools while the request is pending and after completion. Provider events must not modify its `type: user`, content, `deliveryStatus`, or `turnAnchorKey`, reorder it, or render it with assistant/tool/thinking styling.

## Validation and evidence

Run `pnpm exec tsx --test tests/specs/provider-live-non-streaming-render.spec.ts`. The contract imports the production reducer and supplies actual Codex/Pi envelope shapes, including function/tool calls and empty output. Assertions use `filterRenderableMessages()` to check visible accumulation, final convergence, input/output merging, stable identity, and user-bubble order and fields.

Browser coverage is in `tests/spec/codex-first-turn-rendering.spec.ts` and `tests/spec/proposal-92-provider-non-streaming-render.spec.ts`. Required test identity: `contract-provider-non-streaming-block-render`. Required evidence: `state-provider-non-streaming-render`, `screenshot-completed-tool-card`, `screenshot-empty-output-card`, `screenshot-thinking-block-stable`, `screenshot-user-bubble-stable`, and `console-provider-non-streaming-clean`.

Node contracts cannot establish CSS height, bubble alignment, layout stability, thinking-style transitions, or absence of browser key warnings. Capture browser screenshots, console output, and a state snapshot for those claims. Tool coverage is limited to existing normalizer shapes; add regressions for additional MCP tool types when introduced.
