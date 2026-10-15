# Cross-project pending-session board

## Purpose

The root route presents a lightweight board across projects and providers. Codex, Claude Code, and Pi sessions from both the browser and external terminals enter a SQLite read model through provider indexes. The frontend does not scan files or fetch every project overview.

## Requirement: Preserve activity and acknowledgment semantics

- Identity is `(provider, sessionId)`; identical IDs from different providers remain independent.
- Return at most 100 summaries without message bodies. The root route makes one pending-list request and no per-project overview requests.
- Opening, refreshing, or restarting does not acknowledge sessions. Only explicit completion records the observed activity revision.
- A batch acknowledges at most 200 items in one SQLite transaction without deleting provider history.
- If newer activity arrives concurrently, acknowledge only the observed revision and keep the session pending.
- Reject nonpositive, unsafe, noninteger, or future observed revisions.
- New `activity_revision` values make completed sessions reappear. SQLite owns manual-pending and acknowledgment state.
- JSONL modification time, backfills, and appended non-conversation metadata are not new activity and must not revive sessions completed elsewhere.
- "Mark all complete" acknowledges the entire current pending set in one server transaction, independent of the 100-card display limit.
- Migrate legacy project `pending` values once. Any modern acknowledgment or manual flag write ends legacy migration eligibility; restart must not overwrite newer state.

## Tests

- `tests/specs/session-attention-board.spec.ts`: revisions, batching, concurrent activity, and migration.
- `tests/spec/project-list-summary-api.spec.ts`: lightweight project-list boundaries.

## Remaining risks

Provider-file persistence introduces a brief eventual-consistency delay. Very large history indexes remain sensitive to local data volume; bounded lists and indexed query plans are durable requirements.
