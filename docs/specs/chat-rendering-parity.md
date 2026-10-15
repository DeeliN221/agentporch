# Specification: Chat rendering parity

## Requirements: Acceptance matrix

| Contract | Production boundary and evidence | Tests | Remaining risk |
| --- | --- | --- | --- |
| Live assistant has no redundant metadata | Real `MessageComponent` SSR: body visible, Codex heading/timestamp absent | `chat-rendering-parity.spec.tsx` | SSR does not validate final browser layout |
| User acknowledgement precedes response | Real session merge and native reducer: sent user gates same-turn live assistant | Same test | Multi-window late duplicates are covered by merge-core contracts |
| Pi/Codex command parity | Real MessageComponent/ToolRenderer SSR: identical card fingerprint, command and output anchor | Same test | Other tool families need risk-specific coverage |
| Openable file paths | Shared `openFileToolConfig`, ToolRenderer and workspace file opening | Same test; `tests/spec/chat-composer-runtime.spec.ts` | Missing files use existing editor error UI |
| Windows/WSL links | Production `workspaceLinks` resolves cross-platform project-relative paths | `workspace-links.spec.ts`; `tests/spec/chat-file-links-open-in-editor.spec.ts` | Actual filesystem access depends on environment |
| Turn-level non-body folding | Real ChatMessage shapes and `buildTurnDisplayBlocks`, ChatMessagesPane, TurnNonBodyGroup | `chat-rendering-parity.spec.tsx` | Browser checks remain necessary for layout |
| TUI-first sessions | ChatInterface, chatTuiSessionKey, shell WebSocket relay source | `chat-tui-session-boundary.spec.ts` | Browser checks cover terminal integration |
| Frozen JSONL snapshots | Production renderSnapshotController and sessionRuntimeController | `chat-render-snapshot-controller.spec.ts` | Flush latency affects content available at click time |
| Bounded progressive Render | ChatInterface and snapshot state; viewport-based layout/anchor recovery | `chat-performance-boundary.spec.ts` | Extreme font scaling needs browser validation |

Unqualified test names above are under `tests/specs/`.

## Requirements: Assistant body and acknowledgement

A `source: "codex-live"` or `source: "codex-realtime"` assistant MUST show its body without a `Codex` provider heading or row timestamp.

A user with `deliveryStatus: "sent"` MUST gate same-turn live assistant visibility. Once its persisted echo arrives, the visible sequence MUST be persisted user then assistant. This also applies to a first/new turn identified only by `clientRequestId`, without durable `turnAnchorKey`.

## Requirements: Tool and file parity

Semantically identical Pi/Codex command messages MUST both use `data-testid="codex-tool-card"`. Command text, `tool-result-*` anchor, collapsed result behavior and core structure MUST match; Pi MUST NOT use a separate provider-specific command style.

Paths in `view_image`, Read, Edit and FileChanges arguments/results MUST use shared open-file controls. Clicking MUST pass the original path to workspace `onFileOpen`. Images MUST open the right-side image preview, not plain text/JSON.

Windows `<drive>:\\...` and WSL `/mnt/<drive>/...` absolute paths MUST resolve against either corresponding project-root form into the same project-relative path. Paths outside the selected project MUST be rejected.

## Requirements: Turn-level non-body groups

Once the final assistant body starts, thinking, tool calls, batched commands and intervening progress commentary MUST join one turn-level non-body group, collapsed by default. The final body remains directly visible. If a turn includes tools/thinking, only its last assistant body segment qualifies as the directly visible final body.

Before a final body exists, only WebSocket live thinking/tool execution expands by default. Historical replay and non-live incomplete work remain collapsed.

A tools-only non-body block MUST use one tool-call-count summary button, without an extra thinking-and-tools wrapper. Expanding it MUST show flat vertically stacked cards. Cards MUST NOT repeat Codex headings or per-message timestamps. Subtask steps MUST NOT expose concrete tool-type labels. Batched summaries MUST count actual commands correctly, including historical string `toolInput` and split `tool_use`/`tool_result` forms.

## Requirements: TUI-first sessions and frozen Render

Opening a Codex/Pi manual session MUST default to the terminal TUI. JSONL rich rendering requires an explicit user action. Returning from Render MUST preserve the original terminal session key and any existing snapshot.

The TUI key MUST distinguish provider, project path, route session and provider session. A route-backed Pi TUI MUST resume with `providerSessionId`. Disconnecting its WebSocket MUST retain the provider PTY.

Clicking Render creates a snapshot version. `projects_updated`, `codex-complete`, `pi-complete` and `externalMessageUpdate` MUST NOT alter snapshot messages or version. Only explicit re-render reads JSONL again and replaces/increments the snapshot.

For a long session, Render MUST reuse an already loaded visible window for first paint. Otherwise, a persisted session starts with the latest page at offset 0. Each raw-message request MUST have `limit <= 50`. The collapsed first view mounts only its current page. After paint it may quietly prepare approximately six screens of older data with at most three consecutive batches, never full-history hydration.

Entering the reserve page MUST consume buffered data first, append approximately three screens of scrollable history and restore a stable message anchor. Snapshot pagination and its scroll controller MUST be independent of main-session state. Layout MUST converge from the actual viewport, without default background scanning of the complete history.

## Requirements: Contract test execution

Run `pnpm exec tsx --test tests/specs/<file>` for each acceptance-matrix file. Rendering parity loads production MessageComponent/ThemeProvider through Vite SSR, sessionMessageMerge, nativeRuntimeTranscript and buildTurnDisplayBlocks with real ChatMessage/runtime-event shapes. Assert visible HTML, ordering, metadata absence, file controls and card structure. Workspace links test the production resolver. Snapshot tests use production pure controller logic; TUI/performance boundary tests inspect production entry points and relay behavior.
