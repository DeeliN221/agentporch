# Pi session controls and model state

## Tests

- `pnpm exec tsx --test tests/manual/node-history/pi-session-controls-icon-label-contract.test.ts`
- `pnpm exec tsx --test tests/manual/node-history/session-model-controls-direct-select.contract.test.ts`

## Requirement: Render model and reasoning selects directly

### Scenario: Codex controls

The right side of the composer directly displays two selects: current model on the left and reasoning depth on the right. Do not add a trigger button or floating popup. Use ChatGptLogo for the provider icon.

### Scenario: Pi controls

Display direct selects with test IDs `session-model-select` and `session-depth-select`. Do not render `session-model-controls-trigger` or a popup. The provider is identified by PiLogo.

### Scenario: Responsive layout

At widths of at least 640px, arrange selects horizontally. On narrow mobile screens such as 390px, stack them vertically without clipping the right edge. Use select widths `w-28` on mobile, `w-32` on desktop, and `w-36` on wide screens.

## Requirement: Show compact, accurate current values

For Codex model `gpt-4o` and reasoning effort `medium`, display a compact model label such as `4o` and the current depth. For Pi model `openai/gpt-4o`, show its friendly model name and `Medium`; display `Off` when thinking is disabled.

Selecting the already-active Pi model or thinking depth must return early in `handleSetPiModel` / `handleSetPiThinkingLevel` without a redundant model-state PUT.

## Requirement: Keep failure and retry state consistent

- A model-state PUT returning 500 logs `Failed to persist session model state: 500`.
- If `off` was saved successfully and changing to `high` fails, refreshing restores `off`, not the failed value.
- Retrying a request after disconnection sends it once (`piCommandCount=1`).
- Rapid duplicate submission does not produce duplicate messages after refresh.

## Canonical model-state events

`thinking_level_changed -> session-model-state-updated` is the AgentSession subscription mapping. After an idle model change, broadcast canonical session-model-state-updated and listen for `thinking_level_changed`. Extension-only selection events are not AgentSession subscription events.
