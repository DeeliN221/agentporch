# Unified terminal entry and session persistence

## Requirement: Session entries open terminals by default

Clicking an existing session card in the overview or sidebar opens the terminal main view and injects the provider resume command. Codex uses the actual `providerSessionId`; Pi uses `pi --session <providerSessionId>`; Claude uses `claude --resume <providerSessionId>` while retaining `provider=claude`.

Do not load rich JSONL history on a default card click. History and details remain explicit user actions.

Creating a Codex, Pi, or Claude session opens the same ordinary terminal with the provider creation command. Creation and resume share one entry, without introducing another user-facing terminal category. Exiting the TUI leaves an ordinary usable shell.

## Requirement: Keep terminals alive through tmux

Refreshes, disconnects, and WebSocket closure must not kill terminal processes. Real terminals remain in tmux and reconnect to the same session. The backend must actually execute tmux detection, creation, attachment, input, and lifecycle operations rather than merely logging commands.

Plain shells and all provider TUIs share persistence. WebSocket close detaches only the client. Explicit terminal termination or deletion authorizes killing the corresponding tmux session.

After Ctrl-C exits a Codex/Pi TUI, commands such as `pwd` and `git status` remain usable. Do not automatically change card bindings or switch to history view.

## Requirement: History is an explicit parallel view

Only the history/details entry loads structured JSONL messages and tool calls. The view can return to the terminal. In particular, Claude terminal entry must not request history; its paginated history loads only on explicit request.

On desktop, the terminal is a parallel main-workspace view, not a fixed bottom dock. Do not restore old bottom-dock state. Allow it to fill the main workspace, with files as an auxiliary view and history as another parallel view.

## Tests

`tests/specs/terminal-unified-entry.spec.ts` and existing terminal end-to-end tests preserve these contracts.
