# Specification: Workflow state and stage compatibility

This contract covers oz flow read models, legacy v1.2.0 seven-stage runs, batches, child sessions and active changes. Historical co/AgentPorch names below identify the same integration boundaries retained by the current application.

## Test entry points

- `pnpm exec tsx --test tests/backend/wo-workflow-contract.test.ts`
- `pnpm exec tsx --test tests/specs/workflow-boundary.spec.ts`
- `pnpm exec tsx --test tests/e2e/workflow-status-watch-dag-detail.spec.ts`

## Requirements: Authoritative lifecycle state

The frontend MUST send user intent, display local pending feedback and render authoritative co/oz flow state. Local Sets and realtime payloads MUST NOT become the provider/workflow lifecycle source of truth.

Sending in Codex/Pi may display an optimistic user and prevent duplicate submission, but MUST NOT declare the provider authoritatively running solely on click. Interruptibility waits for co `session-status`, `active_turn_id` or equivalent read model. Reloading a session with an active turn MUST restore running state via `check-session-status` or project read model and show the stop button without relying on old `processingSessions`.

Workflow stage, run status, current iteration and interruption state MUST come from oz flow. A chat provider turn controls only whether its child-session input can stop; local chat state cannot override workflow stage facts.

Persisted session messages define final assistant body, reasoning, tools and file changes. Codex/Pi content events may acknowledge, update status or refresh the read model, but MUST NOT themselves become final authoritative history. Earlier versions prohibited any unpersisted body from display; newer live-transcript specifications allow provisional display and terminal reconciliation. The invariant retained here is that final history/order/card structure converge to the persisted read model after completion/refresh. See [message merge](./chat-message-merge-core.md) and [Codex steering](./codex-app-server-steer.md).

Repeated projects_updated/content/complete events MUST leave each user, assistant and tool once, without disturbing scroll position or the loaded history window.

## Requirements: Running, stopping and errors

Local dispatching or authoritative co running MUST turn the composer action into Stop. It requests interruption of the current turn and MUST NOT abort a wrong turn when co has no active turn.

The old ProcessingStatus strip above/below the input MUST NOT appear. Fake token counts, elapsed seconds and legacy escape-to-stop strip text are removed; disconnection messages, attachments, model choice and follow-latest controls remain usable.

An ack/status timeout may display a network error and clear local pending dispatch, but subsequent co/oz read-model updates MUST restore authoritative state. Provider error/failed/aborted MUST show user feedback, dismiss Stop according to co state and leave no local processing residue after refresh. Abort failures cannot rewrite provider lifecycle facts.

## Requirements: Complete batch lists

Batch `changes` is the ordered source of entries. Real started runs retain details; unstarted changes remain pending placeholders with no fabricated runId/detail route.

Given `changes=['change-a','change-b','change-c']` and run_ids only for a/b, the read model MUST have total 3 and that exact order. The UI MUST show three cards: two real stage-progress cards, pending c with no clickable fake route, and header progress `2/3`.

All groups use batch semantics. A single run without batch state MUST appear as a one-item batch with `0/1` or `1/1`, without a separate single-task tab/category. Existing real runIds MUST still open original details with batch marker, stages, child sessions and artifacts intact.

## Requirements: Planner role and session identity

Planner is the primary current role, not the old planning key:

| State fixture | Required result |
| --- | --- |
| `sessions["codex:planner"]="planner-thread-1"` | Planning row has an openable Session entry; planning child route uses that sessionId |
| Planning tool pi and `sessions["pi:planner"]="pi-planner-1"` | Planning sessionRef provider pi and exact Pi ID; no Codex fallback |
| Only `sessions["codex:planning"]="legacy-planning-thread"` | Legacy planning entry remains openable; new fixtures use codex:planner |
| No planner/planning ID | Display Unknown; never fabricate IDs from run ID, stage key or log filename |

## Requirements: Real processes versus provider sessions

runnerProcesses MUST describe real process data, never synthetic rows from `state.sessions` or stage status. With codex:planner/codex:executor sessions and no/empty `state.processes`, role links remain visible but runnerProcesses MUST be `[]` and `workflow-runner-processes` hidden.

An explicit process with pid/session_id MUST preserve both as runnerProcesses.pid/sessionId. A process with `session_id="reviewer-thread-1"` but no pid may display `thread=reviewer-thread-1`, never `pid=reviewer-thread-1` or label that session as a process number.

Role links for planning, execution, review, repair and archive mean provider session IDs and open workflow children. Actual process rows MUST name/render pid from process.pid separately from thread/session from process.sessionId.

Tests and browser fixtures MUST primarily use `codex:planner`. Assert a process section only when the fixture explicitly includes processes; sessions-only fixtures MUST assert its absence.

## Requirements: Legacy v1.2.0 seven-stage compatibility

Read `planning`, `acceptance`, `execution`, `review/fix`, `qa`, `archive` as the v1.2.0 path while keeping older-stage compatibility.

Given sealed stages `planning`, `acceptance`, `execution`, `review_1`, `fix_1`, `review_2`, `qa`, `archive`, `listWorkflowReadModels()` MUST return business-order stageStatuses, label acceptance as acceptance planning and qa as QA acceptance, and report neither as unknown.

Without workflow_display.lines, fallback workflowDisplay.lines MUST include `planning`, `acceptance`, `start`, `review`, `1 fix review`, `qa`, `archive`, retaining review/fix loop folding.

Sessions codex:acceptance/codex:qa MUST become children with stageKey acceptance/qa and routes `/runs/<runId>/sessions/acceptance` and `/runs/<runId>/sessions/qa`. Clicking their stage links MUST enter those existing workflow children, not create ordinary chat sessions.

An existing state.paths.acceptance_summary Markdown artifact MUST attach to stage acceptance; state.paths.qa or equivalent JSON/Markdown QA artifact MUST attach to qa and appear in stage details. Missing paths MUST NOT break list reads; diagnostics MUST include a reviewable missing-path warning.

Sidebar/project workflow cards MUST include stable acceptance and qa progress nodes, retaining review/fix iteration counts. Old verification/ready_for_acceptance runs remain readable, but new runs/primary fixtures MUST NOT depend on these older stages.

## Requirements: Provider-aware children

The provider role map in state.sessions MUST generate workflow children independently of process rows. With only `sessions["pi:executor"]="pi-thread-1"`, childSessions MUST include id pi-thread-1, provider pi and stageKey execution. runnerProcesses remains empty while role summary/stage inspection show the openable session.

If an explicit process and role map both identify pi-thread-1, childSessions MUST deduplicate it once, retain provider pi and keep the actual pid in runnerProcesses. Other role providers, including codex:reviewer, MUST likewise preserve their own provider without global Codex fallback.

Clicking a Pi executor role MUST open `/runs/<runId>/sessions/<address>` or `/runs/<runId>/sessions/by-id/<sessionId>`. selectedSession.workflowId MUST identify the run and selectedSession.__provider MUST be pi.

Pi child message requests to `/api/projects/:projectName/sessions/:sessionId/messages` MUST include `provider=pi`. Backend MUST NOT fall back to Codex JSONL. If co conversation state has provider pi, provider_session_id pi-thread-1 and durable user/assistant turn events, show those messages marked pi. If the referenced conversation is absent, show empty history or a clear error, never unrelated same-name Codex/Pi content.

## Requirements: Lightweight active changes

Opening the workflow action dialog MUST resolve only the current project path for `/api/projects/:projectName/openspec/changes`, without whole-project provider population or `attachWorkflowMetadata(await getProjects())`.

If `oz list --json` returns active `["a","b"]` and an existing workflow claims a, return `["b"]` with existing `listProjectAdoptableOpenSpecChanges` ordering. With immediate oz output and a small current-project workflow read model, unrelated provider-history scans MUST NOT impose multi-second delay. Tests MUST prove the path does not depend on full-project `getProjects()`.

The established architecture remains: realtime Pi workflow events may refresh the read model, final transcript comes from co durable conversation messages, and sessions-only state never exposes a fake runner process or treats pi-thread-1 as a pid.
