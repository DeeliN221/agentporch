# Pi session controls, recovery, and tool-card index

Detailed requirements are maintained separately:

- [Session controls and model state](pi-session-controls.md)
- [Recovery and persisted ordering](pi-session-recovery.md)
- [Tool cards and reasoning blocks](pi-tool-card-rendering.md)

## Requirement: Keep Pi input requirements traceable

A reviewer opening this original index must be able to locate the relevant controls, recovery, or tool-card specification and executable test entry.

## Tests

- `pnpm exec playwright test tests/e2e/pi-session-61-direct-controls-tool-recovery.spec.ts`
- `pnpm exec playwright test tests/e2e/pi-session-input-tool-rendering.spec.ts`
