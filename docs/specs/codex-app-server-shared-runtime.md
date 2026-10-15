# Shared Codex runtime and safe takeover

## Requirement: Keep the daemon independently managed

- A system service manager starts and maintains Codex app-server. AgentPorch never starts, stops, restarts, or configures it.
- AgentPorch connects through a client proxy. Closing AgentPorch closes only its own connection.
- Probe client capabilities asynchronously. Concurrent probes for the same executable share a result; successful results are cached briefly and failures remain retryable.
- Without an existing AgentPorch tmux terminal, use `codex --remote unix://PATH resume <threadId>` to connect the terminal to the same daemon.

## Requirement: Verify ownership before takeover

- Normal takeover requires an actual connection handshake, target-thread ownership, and active-turn verification. Warn before taking over legacy active or unknown sessions.
- A historical thread verified read-only but not yet loaded can be resumed through the remote TUI when no active turn exists.
- After explicit forced-takeover confirmation, create managed tmux under the original cN card and bind the new remote-TUI thread back to that card.
- Use a short-lived, single-use confirmation token. Reject expired/replayed tokens and changed card bindings.
- Never stop, resume, write to, or implicitly send input to the old thread during forced takeover. Its original terminal continues independently.

## Tests

- `pnpm exec tsx --test tests/backend/codex-shared-runtime.test.ts tests/specs/terminal-unified-entry.spec.ts`
- `pnpm exec playwright test tests/e2e/codex-shared-app-server-handoff.spec.ts`
