# Chat session identity

## Requirement: Centralize identity rules

When temporary drafts, unsaved sessions, cN aliases, provider IDs, or workflow-child identities change, implement the rules in `frontend/components/chat/session/sessionIdentity.ts`. `ChatInterface.tsx`, `useChatComposerStateImpl.ts`, `useChatRealtimeHandlersImpl.ts`, and `useChatSessionStateImpl.ts` must not duplicate `isTemporarySessionId`, `isAgentPorchRouteSessionId`, `resolveProjectSessionProvider`, or `resolveSessionRoutingContext`.

## Requirement: Test provider and routing context as pure functions

Given projects containing native Codex/Pi sessions and cN route indexes, direct IDs, route aliases, and workflow children must resolve to the correct provider. Preserve `projectName`, `projectPath`, `workflowId`, and `workflowStageKey`.

Test: `pnpm exec tsx --test tests/specs/chat-session-identity.spec.ts`.

## Requirement: Isolate TUI identities

TUI keys must include `projectPath`, `provider`, `routeSessionId`, and `providerSessionId`. Codex and Pi must never reuse a PTY. Resume route-backed Pi sessions with `providerSessionId`, not their cN alias. Retain non-plain-shell TUI PTYs after WebSocket disconnection and allow same-key reconnect with buffered output.

Test: `pnpm exec tsx --test tests/specs/chat-tui-session-boundary.spec.ts`.

## Requirement: Preserve actual chat behavior

After centralizing identity, message submission, realtime output, persisted-history merging, and project refresh coordination must remain stable. Run:

- `pnpm run test:spec:browser -- tests/spec/chat-composer-runtime.spec.ts`
- `pnpm exec tsx --test tests/specs/chat-message-merge-core.spec.ts`
- `pnpm exec tsx --test tests/specs/project-refresh-coordination.spec.ts`
- `pnpm run typecheck`
