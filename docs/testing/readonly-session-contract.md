# Session browser contract

Historical sessions open in Render. This surface displays persisted messages and supports navigation, search, folding, and file previews. It has no message composer, attachment submission, or model-setting controls. Opening or refreshing history must not initialize a provider terminal.

New sessions open in Shell. Continuing history requires selecting Shell explicitly. The terminal must resume the same provider session, keep project/session isolation, and relay input once. Provider CLI controls belong to that terminal.

Browser regression migrations preserve the current business behavior:

| Previous assertion | Current assertion and coverage |
| --- | --- |
| Send from an HTML textarea | Real PTY/tmux input and reload in `terminal-new-session.spec.ts`; explicit historical resume in `terminal-history-resume.spec.ts` |
| Repeated composer submissions with attachments | Repeated keyboard, paste, and drop gestures cannot submit or upload from Render in `chat-message-submission-idempotency.spec.ts`; terminal delivery remains covered separately |
| Change reasoning depth in Render | Opening and reloading history does not write model state in `codex-reasoning-depth-live.spec.ts` |
| Immediate chat WebSocket file cards | Saved file-operation JSON and native file changes render as cards, preserve ordinary JSON, and survive reload in `file-operation-json-card-rendering.spec.ts` |
| Browser-managed live turn/steering/abort controls | Shell relays raw input to the provider CLI; Render cannot submit or abort. Sequential input and reload are checked through real tmux in `browser-followup-steer-business.spec.ts` |
| Live provider events replace rendered text immediately | Saved Render snapshots remain stable while events arrive; explicit reload reads the saved provider history. Follow-up order and fetch-error recovery remain covered |
| Three prompts sent through the removed composer | Native Codex and Pi JSONL histories preserve three distinct turns after reload in `three-message-persistence.spec.ts`; long Pi thinking and tool outputs remain inspectable |
| Always-visible tool cards | Expand turn details before inspecting commands, outputs, thinking order, and file previews |
| Repeated Pi prompts are transport echoes | Distinct persisted message IDs remain separate turns, including subsecond repeats; identical IDs still deduplicate |

These migrations do not make the complete release suite green by themselves. The release workflow still requires every browser shard, package checks, and installer checks. A successful targeted run is not a published release.

Workflow acceptance uses the current four-stage table: Execution, Optimization, Test, and Archive. Planning is independent and must not be restored as a table column. Session links, artifact previews, and reload persistence remain required.
