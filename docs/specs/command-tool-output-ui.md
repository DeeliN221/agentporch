# Command tool output controls

## Scope

Define output expansion for command cards in Codex/Pi manual sessions, including Bash, `functions.exec_command`, its aliases, and context-mode execute variants.

## Requirement: Keep each command in one card

Do not render a visible `Output` summary inside command cards. Never split `function_call` and `function_call_output` with the same `call_id` into separate cards.

## Requirement: Accessible, synchronized output expansion

- Provide a clickable icon-only expand/collapse button (`▸` / `▾`) with `Show output` / `Hide output` aria labels.
- Expose output anchors as `tool-result-{callId}` for navigation, scrolling, and tests.
- Expanded output must show actual stdout/stderr in a `<pre>` element.
- Keep icon buttons and details/summary expansion synchronized in both directions.
- Trim outer blank lines before rendering stdout/stderr/results, using the same normalization for failures and successes while preserving indentation on nonempty lines.

## Implementation

- `frontend/components/chat/tools/components/ContentRenderers/ContextCommandContent.tsx`: `ContextCodeCard`.
- `frontend/components/chat/view/subcomponents/MessageComponent.tsx`: `enableResultAnchor` propagation.

## Tests

- `tests/spec/codex-first-turn-rendering.spec.ts`: no visible Output row during live or persisted rendering.
- `tests/spec/codex-jsonl-single-source-rendering.spec.ts`: expanded historical command output remains visible.
- `tests/specs/command-tool-output-normalization.spec.ts`: trim outer blank lines while preserving meaningful indentation.
