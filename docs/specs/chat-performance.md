# Specification: Chat performance, virtualization and project refresh

This contract covers long-session DOM size, history navigation, bookmarks, file mentions, project summaries and idle/real-time refresh costs.

## Test entry points

Run `pnpm exec tsx --test <path>` for:

- `tests/spec/chat-history-full-text-search.spec.ts`
- `tests/spec/session-idle-network-stability.spec.ts`
- `tests/e2e/frontend-idle-no-polling.spec.ts`
- `tests/specs/chat-performance-boundary.spec.ts`
- `tests/specs/chat-message-bookmarks.spec.ts`

## Requirements: Bounded history and scroll anchors

Opening a session with more than 1,000 messages containing text, Markdown, code, tool cards and diffs MUST show the newest content. Requests MUST include `limit` or `afterLine`; `.chat-message` DOM count MUST stay within the implementation's virtual-window bound. Repeated upward pagination may retain old data in memory for navigation/search, but MUST NOT render all loaded history.

Upward scrolling into the history preload zone MUST request older history even at `scrollTop > 100`, using bounded conversation pagination such as `limit=50` plus cursor/offset. Collapsed thinking/tool details may accompany their conversation page without independently consuming its quota. Bottom-follow mode MUST NOT accidentally preload old history. No transition may issue an unbounded full-history request.

When loading an older page while `assistant turn 120` is at the viewport top, that message MUST remain near the same perceived position. Do not jump to the latest message or the new page's top. New live/external messages MUST merge into loaded data without forcing a reader of older history to the bottom. Returning to the bottom or using the latest-message action restores following.

## Requirements: Lazy heavy content

Collapsed tools with large stdout/JSON, diffs, code blocks and subtask details MUST initially render only lightweight names, summaries, statuses or small previews. Full output MUST be absent from the DOM until expansion. A large fenced code block MUST initially expose language/line count/truncated preview without eagerly mounting complete syntax highlighting; expansion may load full code/highlighting.

## Requirements: Fast Render snapshots

Switching from TUI to Render MUST display the already loaded visible window or latest page before scanning older JSONL. The chat scroll container MUST appear within the first-paint budget rather than remaining at `Rendering session history...`.

Before first paint, `/messages` requests MUST stay within a small window and MUST NOT request high-offset history. After paint, at most three batches may quietly warm older history into memory without enlarging first-paint DOM or blocking interaction. Full sequential history scanning is prohibited.

After laying out a tail batch with at most 50 conversation-content items, the first view should provide approximately two screens of scroll height and memory should hold approximately six screens of older history. Entering the reserve page MUST consume memory first, add approximately three screens of scrollable history per user trigger and restore a stable message anchor. Further bounded warming is allowed only below the buffer target. Unexpanded tools, thinking, stdout, diffs and Markdown MUST NOT mount full lazy content, and `.chat-message` count remains bounded.

## Requirements: Search and bookmarks

Clicking a search result already loaded but outside the virtual window MUST scroll it into the DOM and highlight/locate it. For an unloaded old result, load fixed-size pages until its `messageKey` appears or absence is established, then scroll to it. Loading MUST NOT turn the entire history into DOM.

Each current-session user message MUST produce one bookmark. Its reply summary MUST be the first 50 characters of the following final assistant body, without added ellipsis or rewritten summarization. Thinking, tools/results, errors and subagent-container messages cannot supply this final summary. A user with only thinking/tools/incomplete assistant output still gets a bookmark whose status and localized summary indicate a reply in progress.

Bookmark navigation MUST use the user `messageKey`, never text search. Unloaded targets MUST use paginated requests with a stop condition, without a full-load shortcut. The found target MUST enter the viewport.

Desktop MUST provide an opener for a bookmark list that is hidden by default, occupies left-side space only when open, can be hidden again and never covers the composer. Mobile MUST hide the desktop opener/list and provide its own panel opener. For sessions exceeding 1,000 turns, requests and DOM remain bounded and every summary remains at most 50 characters.

An explicit load-all action may enlarge in-memory data/indexes, but DOM stays bounded and scrolling/search/latest navigation remain usable. Load-all and unloaded-target navigation MUST loop over fixed-size pages with termination guards against duplicate pages/infinite loops. `limit=null` and equivalent unlimited requests are prohibited.

## Requirements: Resilient project overview

`/api/projects` MUST remain usable when a provider index is slow, fails or contains substantial history. If indexing exceeds the home-page budget, return manually configured or cached projects without waiting indefinitely, then allow a later refresh to fill provider summaries. Unreadable Pi SQLite or provider history directories MUST NOT fail the whole request.

Keep every manually configured project. If more than 50 provider-only projects exist, return at most the 50 most recently active, ordered by latest session activity.

An absent/explicitly unknown `messageCount` MUST produce no count or placeholder on home-page and sidebar session cards; do not convert unknown to zero. Real positive counts may be displayed.

Project-list payloads MUST contain only a bounded recent set of session summaries/statistics, not unlimited session history or full workflow details. Payload size MUST NOT grow linearly with all historical sessions. Show-more MUST page the relevant project's sessions and merge only that list, without rebuilding every project read model.

## Requirements: File mentions

File selection MUST support fuzzy multi-token name/path search. Given `frontend/components/chat/view/subcomponents/ChatMessagesPane.tsx`, query `cmp msg pane` MUST include `ChatMessagesPane.tsx`; selecting it inserts its path. Name, directory and abbreviation combinations MUST rank by relevance, with bounded results.

Opening the file selector MUST initially show the selected project's root files/directories, with expandable/collapsible directories. Selecting a file under `frontend/components`, for example, MUST close the selector, insert its relative path and return focus to the composer.

Composer initialization MUST NOT preload the default full tree from `/api/projects/:projectName/files`; ordinary messages remain usable. Opening `@` may load shallow directories or search data constrained by depth, limit or query. Do not default to `depth=10&showHidden=true`. Search MUST stay inside the actual current project root, return insertable relative paths and exclude unrelated hidden runtime directories.

## Requirements: Types and development infrastructure

`pnpm run typecheck` MUST pass, including ChatAttachment index-signature and deliveryStatus typing. `messageDedup.ts`, `sessionMessageMerge.ts` and `messageKeys.ts` MUST import the business `ChatMessage` type rather than redeclare divergent copies.

Vite MUST ignore `.pnpm-store`, `.tmp`, `dist`, `dist-node` and `.playwright-cli`, avoiding watcher `ENOSPC` under `.pnpm-store/v10/files`. `pnpm run test:spec:browser` global setup MUST start backend and Vite with `127.0.0.1:<vitePort>` reachable; missing frontend service MUST NOT cascade into `ERR_CONNECTION_REFUSED` failures.

## Requirements: Stable idle and scoped real-time refresh

After initial messages, token usage, model state and slash commands load on `/projects/<project>/cN`, five idle seconds MUST produce no repeated `messages`, `token-usage`, `model-state` or `commands/list` requests or resulting project-index rebuilds.

Effects MUST depend on stable business keys. An unrelated `projects_updated` replacing selectedProject/selectedSession object references without changing identity MUST NOT reload current-session data or disturb interaction state.

Codex/Pi transcript or workflow changes MUST NOT routinely broadcast a full project snapshot. A changed `.codex/sessions` JSONL notification MUST identify provider, projectPath and sessionId or changedFile, omit a full `projects` array, and refresh only the affected session/project summary. A background change in session Y MUST NOT clear/reload the transcript currently showing session X or cause a long task from processing complete project data. The sidebar may mark only relevant summaries stale.

Appending to the current session MUST incrementally load/merge that session alone, without refreshing all projects, sessions or the whole file tree. Compare project refreshes through stable signatures or field-level versions for displayed/status fields. Do not deep-serialize large sessions/workflows/codexSessions/piSessions arrays with `JSON.stringify`.

## Requirements: Localization and first-load resources

With `zh-CN` selected, main navigation/chat entry points MUST show understandable Chinese translations or meaningful icons, not unresolved keys such as `search.placeholder` or primary English fallbacks such as `Show more sessions`, `New Session` and `Messages`. This is an explicit translated-interface contract; the default interface language is English.

Loading the home page MUST successfully serve favicon requests or avoid requesting missing resources; `/favicon.ico` MUST NOT generate a console 404.

## Requirements: Openable Markdown links

Given existing `src/openable-link.ts`, directory `src/folder-only/`, absent `src/missing-link.ts` and plain href `just words`, only the existing file MUST become a clickable project link opening the embedded editor. Directories, missing files and plain words MUST remain plain text without link role/blue styling.

External `https://example.com/docs` MUST remain a browser link with `target="_blank"` and `rel="noopener noreferrer"`.
