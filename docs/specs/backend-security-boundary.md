# Backend security boundaries

## Requirement: Secure authentication defaults

The deployment uses a fixed, exactly 32-character access token. Compare it in constant time and manage a separate JWT secret solely for internal sessions.

### Scenario: Exchange the access token for an internal session

Given an `AGENTPORCH_ACCESS_TOKEN` containing exactly 32 characters in `.env`, submitting a matching token issues an expiring internal JWT. Reject missing or malformed configuration. Do not expose registration, username selection, or a localhost first-user bypass.

### Scenario: Generate the JWT secret securely

When the database first needs a token and no secret exists, generate a strong secret and persist it with owner-only read/write permissions. Restarts and multiple service processes must reuse the same secret. Issued tokens must expire.

## Requirement: Restrict Agent and Git paths to allowed workspaces

Agent APIs, Git routes, and provider runtimes must not pass arbitrary client paths to privileged operations. Given a registered project, reject `/tmp`, `/etc`, parent traversal, and symlink escapes while resolving `projectPath`, before invoking the provider or Git.

## Requirement: The independent Codex service owns permissions

AgentPorch is only an app-server client. When building `thread/start` or proxy arguments, do not override sandbox or approval policies. Administrators configure those policies on the independent Codex service.

## Requirement: Keep credentials out of leak-prone channels

HTTP, WebSocket, SSE, Shell, Agent API, and clone entry points must not place tokens or API keys in URL queries. Saved GitHub credentials must not appear in clone URLs, process arguments, or direct environment-variable values. Store newly created API keys as digests.

AgentPorch no longer manages application encryption keys for recoverable credentials or provides new persistent credential-write endpoints. Protect databases containing historical provider credentials with operating-system access controls. Records encrypted with a retired key cannot be decrypted after upgrade and require runtime credentials to be supplied again.

Tests: `tests/specs/backend-security-boundary.spec.ts`.

## Requirement: Run command and file-boundary regression tests by default

### Scenario: Command allowlists and output normalization

Reject shell operators, disallowed commands, dangerous arguments, and escaped paths. Parse permitted commands into command/argument pairs. Strip control characters from output while preserving newlines. Tests: `tests/backend/command-parser.test.ts`.

### Scenario: Directory exclusions and permission text

Skip heavy/generated directories such as `node_modules`, `dist`, and `.git`, but retain ordinary business directories. Convert Unix permission bits to readable rwx text. Tests: `tests/backend/file-routes-boundary.test.ts`.
