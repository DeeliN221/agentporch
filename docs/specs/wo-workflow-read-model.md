# Specification: oz flow workflow read model

## Requirements: schema and projection boundaries

External sealed `state.json`, `oz flow graph` JSON, artifacts, and child-session data are normalized through `workflow-state-schema.ts` and `workflow-graph-schema.ts`. These export business normalizers and normalized types; `status-summary.ts` and `dag-read-model.ts` import them instead of forwarding broad `any` into core logic. Missing/mistyped fields and legacy fallbacks produce diagnosable warnings. Preserve stages, artifact links, runner processes, role summaries, child routes, diagnostics, and existing fallback regressions. Record `test-results/17-workflow-read-model-schema/source-audit.json`.

Artifact, child-session, runner-process, and diagnostic projections live in separate documented modules exporting business entry points. Read-model coverage retains seven-stage, artifact, child-session, and runner-process behavior.

`backend/domains/workflows/read-model/` retains `stage-taxonomy.ts`, `session-refs.ts`, `artifact-reader.ts`, `dag-read-model.ts`, and `status-summary.ts`, each implementing its own concepts. No suppressions, throwing boundary stubs, reverse imports of `legacy-core.js`, or delegation of extracted rules back to `builder-internals.js` is allowed. `workflow-read-model.ts` remains thin; old `legacy-core.js`/`builder-internals.js/.d.ts` cannot duplicate extracted implementations. Source audits alone cannot prove legacy runner compatibility; backend and browser regressions are required.

`stage-session-resolver.ts` owns provider session-key parsing, reverse provider lookup, subagent-role/stage mapping, and planner fallback. Summary and DAG modules do not separately define `resolveSessionProviderFromState`. Cover sessions-only input, `pi:executor`, active review rounds, planner fallback, sparse stages, `dag_nodes`, provider-aware keys, Go runner state, and historical planning fallback without deleting compatibility assertions. Record `test-results/23-workflow-stage-session/source-audit.json`.

## Requirements: frontend view models and process identity

`WorkflowDetailView.tsx` composes view models and child components. Continue/resume/abort inference, artifact-path selection, and provider-aware child-route options stay in the detail view model. Both tables and trees retain current-round artifacts and session navigation. `tests/unit/workflow-detail-view-model.test.ts` covers visual progress, continuation state, columns, role-artifact selection, and path resolution.

Sessions-only data without a PID cannot masquerade as a runner process. Process/session numbers remain semantically distinct. Explicit unsupported providers produce diagnostics instead of being downgraded to another provider.

Workflow boundary/read-model/presentation/control-plane tests retain relevant runtime evidence under ignored `test-results/10-workflow-boundary/`: read-model snapshot, view-model audit, process snapshot, action log, detail screenshot, or route trace. These outputs need not be tracked.

## Requirements: stage-version compatibility and QA artifacts

For oz flow v1.3.0 states with `execution`, `review_1`, `qa_1`, `fix_1`, `review_2`, `qa_2`, and `archive` but no acceptance stage/session/artifact, show planning as the merged planning/acceptance-contract stage. Do not invent an empty acceptance row or diagnose `qa_1`/`qa_2` as unknown. Historical v1.2.0 states with explicit `stages.acceptance`, acceptance sessions, or acceptance-summary artifacts retain their separate row and links.

Existing `qa-2.json` appears as a clickable QA artifact with actual QA iteration count, opening exactly as `review-2.json` does. Missing inferred/state-referenced QA files do not produce broken links; diagnostics identify the missing path.

## Requirements: DAG read model

Given readable sealed state and `oz flow graph --change <change-name> --format json`, `listWorkflowReadModels(projectPath)` returns DAG nodes, conditional edge labels, gate stages/iterations, and artifact `node_id` relationships. Existing graph artifacts such as `parallel-planning_context.json`, `review-1.json`, `qa-1.json`, and `fix-1-summary.md` each become `reviewTargets[kind=artifact]` with an openable path and `exists: true`.

If graph execution is unavailable or fails, readable state still yields `stageInspections`; `workflowDag.source.available` is false and diagnostics explain the failure.

## Requirements: one status tree for review navigation

The workflow title is a plain heading without embedded links/buttons. Detail shows `workflow-status-tree` with stage name, execution status, and duration, rather than a separate `workflow-dag-view` or `workflow-review-panel`. No independent session-ID column is retained.

Stage names navigate to workflow-child sessions, subagent names to internal child routes, and artifact filenames to their actual contents, including execution `SUMMARY.md`. Extra Session/View/Open buttons cannot replace clicking names. Internal names strip prefixes such as `review subagent:` without displaying long session IDs; retain the user's actual name, including Unicode, as the clickable label.

Planning shows real top-level files/directories from active or archived oz changes. Order `brief.md`, `proposal.md`, `design.md`, `spec.md`, `task.md`, `acceptance.json`, and `tests/` first, then other names alphabetically. Names themselves are clickable. Group `review_1`, `qa_1`, and `fix_1` under Round 1, and `review_2` under Round 2, retaining each round's clickable artifacts.

Graph-only session/artifact review targets that can be assigned to stages merge into `stageInspections`. Preserve artifact open paths, relative paths, existence flags, and provider-aware child routes. Users need no separate DAG panel to reach them.

## Requirements: factual status summaries and pruning

Role summaries use sealed state, `oz flow status --run-id <run-id> --json`, or equivalent runner JSON. Never parse human-formatted status text or infer observed rounds from `max_review_iterations`.

For `engine: go-dag`, configured maximum 30, and actual stages `execution`, `review_1`, `fix_1`, `review_2`, `fix_2`, `review_3`, `qa_3`, `archive`, show engine go-dag, three reviews (`✓✓✓`), two fixes (`✓✓`), and the active archive marker (`→`), not 30 rounds. If status JSON fails, fall back to sealed-state sessions/stages and record the reason. Sparse stages supplemented by successful `dag_nodes.execution` with `finished_at` show execution `✓` and current review `→` without future template rounds.

Graph templates may contain 30 rounds, but visible nodes require state, session, artifact, DAG-node, or gate evidence. For evidence of reviews 1–3, fixes 1–2, QA 3, and archive, retain those nodes and omit unobserved `qa_1`, `qa_2`, `fix_3`, `review_4`, `gate_review_30`, `qa_30`, and `fix_30`. Edges cannot reference removed nodes; gates cannot retain pruned rounds. Pending-only review/fix/archive stages with no other evidence appear in neither the visible DAG nor role summary.

## Requirements: provider-aware workflow ownership

Parallel workflow subagents remain internal review/context sessions, excluded from ordinary manual groups in project pages and sidebars. A graph subagent target `{sessionId: parallel-review-agent-thread, provider: codex}` filters that exact pair but not `pi` with the same ID. Ordinary CLI sessions remain visible; the workflow's stage-tree review route still reaches the owned child.

Project summary ownership metadata `workflowOwnedSessionRefs` carries `{sessionId, provider}` pairs derived from DAG targets and runner processes. Pi cannot be mislabeled Codex; frontend filtering compares both fields.

## Review scope

Block findings introduced by the current change, directly affecting required tests/evidence or visible behavior, or regressions caused in necessarily touched paths. Existing unrelated security, quality, test, and architecture debt is nonblocking unless the change introduces/amplifies it or invalidates acceptance.

Review artifacts put blockers in `findings[]` with `scope=current_change`, `scope=acceptance_contract`, or `scope=introduced_regression`; unrelated existing debt goes in `non_blocking_findings[]` with `scope=out_of_scope_existing`.
