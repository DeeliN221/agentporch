# Manual browser-history inventory

These historical regressions need manual environments, long reproduction sequences, or historical data. They are not default gates. Reliable scenarios confirmed as current automated contracts live in `tests/spec` or `tests/e2e`.

## Disposition policy

- `manual-retained`: valid risk requiring a special environment, old data, external services, or manual verification.
- `migrated`: current behavior has canonical automated coverage elsewhere.
- `pending-deletion`: obsolete co-only behavior without current provider value and no default-gate references; deletion remains a separate decision.
- `needs-review`: disposition requires further evidence.

No unprocessed default-gate candidates remain in this inventory. Retained rows identify business value, prerequisites, and evidence locations.

| File | Disposition | Reason |
| --- | --- | --- |
| `tests/manual/browser-history/chat-realtime-dedup.spec.ts` | manual-retained | Business value: Live/persisted message deduplication. Prerequisite: a real multi-step session refresh. Evidence: trace or log in `test-results/manual-history/chat-realtime-dedup/`. |
| `tests/manual/browser-history/co-browser-reconnect.spec.ts` | manual-retained | Business value: Reconnect recovery. Prerequisite: reproducible legacy co/provider history. Evidence: trace or log in `test-results/manual-history/co-browser-reconnect/`. |
| `tests/manual/browser-history/co-session-followup.spec.ts` | manual-retained | Business value: Follow-up deduplication and cN/co migration. Prerequisite: legacy session fixtures. Evidence: trace or log in `test-results/manual-history/co-session-followup/`. |
| `tests/manual/browser-history/co-tail-window-and-cursor-refresh.spec.ts` | manual-retained | Business value: Tail/cursor persistence auditing. Prerequisite: legacy co session history. Evidence: trace or log in `test-results/manual-history/co-tail-window-and-cursor-refresh/`. |
| `tests/manual/browser-history/codex-followup-ws-dedup-order.acceptance.spec.ts` | manual-retained | Business value: Codex follow-up, WebSocket deduplication, and ordering. Prerequisite: a real Codex realtime sequence. Evidence: trace or log in `test-results/manual-history/codex-followup-ws-dedup-order/`. |
| `tests/manual/browser-history/codex-streaming-stop-and-delta.spec.ts` | manual-retained | Business value: Streaming stop controls and delta appends. Prerequisite: a real Codex streaming session. Evidence: trace or log in `test-results/manual-history/codex-streaming-stop-and-delta/`. |
| `tests/manual/browser-history/converge-realtime-no-direct-transcript.spec.ts` | manual-retained | Business value: Codex/Pi provider read-model convergence. Prerequisite: real provider scenarios. Evidence: trace or log in `test-results/manual-history/converge-realtime-no-direct-transcript/`. |
| `tests/manual/browser-history/converge-workflow-child-session-wo-co.spec.ts` | manual-retained | Business value: Cross-provider workflow child sessions. Prerequisite: legacy wo/co workflow samples. Evidence: trace or log in `test-results/manual-history/converge-workflow-child-session-wo-co/`. |
| `tests/manual/browser-history/file-mention-lazy-loading.spec.ts` | manual-retained | Business value: Lazy file mentions in large projects. Prerequisite: a large file tree and performance observation. Evidence: trace or log in `test-results/manual-history/file-mention-lazy-loading/`. |
| `tests/manual/browser-history/frontend-idle-no-polling.spec.ts` | manual-retained | Business value: Idle polling and resource use. Prerequisite: browser network observation. Evidence: trace or log in `test-results/manual-history/frontend-idle-no-polling/`. |
| `tests/manual/browser-history/main-content-title-resume-id.spec.ts` | manual-retained | Business value: Resume ID display and historical session identity. Prerequisite: provider history with resume IDs. Evidence: screenshot or log in `test-results/manual-history/main-content-title-resume-id/`. |
| `tests/manual/browser-history/manual-session-edit-detail-and-tool-labels.spec.ts` | manual-retained | Business value: Edit tool detail and labels. Prerequisite: history fixtures containing tool calls. Evidence: screenshot or trace in `test-results/manual-history/manual-session-edit-detail-and-tool-labels/`. |
| `tests/manual/browser-history/mobile-session-view-regression.spec.ts` | manual-retained | Business value: Mobile history, scrolling, and composer visibility. Prerequisite: manual multi-viewport review. Evidence: screenshot or trace in `test-results/manual-history/mobile-session-view-regression/`. |
| `tests/manual/browser-history/mobile-single-view-workspace.spec.ts` | manual-retained | Business value: Mobile single-view workspace. Prerequisite: manual mobile viewport review. Evidence: screenshot or trace in `test-results/manual-history/mobile-single-view-workspace/`. |
| `tests/manual/browser-history/pi-session-daily-followup-steer-refresh.acceptance.spec.ts` | manual-retained | Business value: Pi daily use, follow-up, steering, and live refresh. Prerequisite: a real Pi native SDK. Evidence: trace or log in `test-results/manual-history/pi-session-daily-followup-steer-refresh/`. |
| `tests/manual/browser-history/settings-sidebar-simplification.spec.ts` | migrated | Current behavior is covered by `tests/spec/settings-sidebar-simplification.spec.ts`; retained here for historical comparison. |
| `tests/manual/browser-history/wo-v130-qa-json-link.spec.ts` | manual-retained | Business value: Historical wo v1.3.0 QA JSON links. Prerequisite: matching historical artifacts. Evidence: screenshot or log in `test-results/manual-history/wo-v130-qa-json-link/`. |
| `tests/manual/browser-history/workflow-action-dialog.spec.ts` | manual-retained | Business value: Workflow creation and change binding through UI. Prerequisite: an operational backend workflow path. Evidence: trace or log in `test-results/manual-history/workflow-action-dialog/`. |
| `tests/manual/browser-history/workflow-presentation.spec.ts` | migrated | Current behavior is covered by `tests/spec/workflow-presentation.spec.ts`; retained here for historical comparison. |
| `tests/manual/browser-history/workspace-dock-layout.spec.ts` | manual-retained | Business value: Workspace dock layout. Prerequisite: manual drag and multi-viewport review. Evidence: screenshot or trace in `test-results/manual-history/workspace-dock-layout/`. |
| `tests/manual/browser-history/workspace-dock-regression.spec.ts` | manual-retained | Business value: Dock resize and Git panel stability. Prerequisite: manual drag interaction. Evidence: screenshot or trace in `test-results/manual-history/workspace-dock-regression/`. |
| `tests/manual/browser-history/workspace-dock-width-regression.spec.ts` | manual-retained | Business value: Dock width and editor readability. Prerequisite: manual viewport review. Evidence: screenshot or trace in `test-results/manual-history/workspace-dock-width-regression/`. |
| `tests/manual/browser-history/workspace-regression.spec.ts` | manual-retained | Business value: Desktop workspace tabs and chat visibility. Prerequisite: manual desktop viewport review. Evidence: screenshot or trace in `test-results/manual-history/workspace-regression/`. |
| `tests/manual/browser-history/workspace-scroll-and-pane-controls.spec.ts` | manual-retained | Business value: Workspace scroll containers and pane controls. Prerequisite: manual scrolling and dragging. Evidence: screenshot or trace in `test-results/manual-history/workspace-scroll-and-pane-controls/`. |
