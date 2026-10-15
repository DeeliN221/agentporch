# Global npm distribution

## Requirement: Ship a precompiled product

Build a release candidate once from a worktree with locked dependencies. The installed `agentporch` reads compiled output and required runtime assets; it does not require Git, pnpm, TypeScript, tsx, tsc, or Vite.

### Scenario: Install the actual tarball globally

- `bin.agentporch` points to a compiled entry directly executable by Node.js.
- Include the compiled backend/frontend, database SQL, and command assets.
- Exclude TypeScript, source maps, tests, proposal records, development scripts, and runtime data.
- The installed package serves `/health`, the Web UI, and access-token configuration status.
- Installation, packing, startup, and publishing do not rebuild the product.

## Requirement: Keep mutable state in the user directory

Use `AGENTPORCH_HOME` or the default `~/.agentporch`, never the global installation directory.

### Scenario: First, repeated, and concurrent initialization

- Keep `.env`, `agentporch.db`, and `.jwt-secret` in the same user directory.
- Generate a missing access token from a cryptographic source with exactly 32 URL-safe characters.
- Persist the independent JWT secret without displaying it or writing it into `.env`.
- Only the process creating a new access token may display it; restarts and concurrent startup preserve existing secrets.
- Invalid existing tokens produce actionable errors rather than silent replacement.
- Use POSIX permissions 0700 for the directory and 0600 for secret files; use platform ACL semantics on Windows.
- Initialize user state before loading any service module that may open SQLite.

## Requirement: Support read-only installation directories

Both `agentporch` and `agentporch status` work with a read-only installation. Do not create configuration, secrets, SQLite, WAL, or SHM files there. Status reports effective paths without creating secrets in an uninitialized home.

Listen on `127.0.0.1` unless HOST is explicitly configured. Process HOST, PORT, and DATABASE_PATH override the user `.env`.

## Requirement: Preserve user state on upgrade and uninstall

Tokens, JWT secrets, SQLite records, and business markers created by an earlier candidate using the current AgentPorch paths survive upgrade. Former product paths and environment-variable aliases are not discovered or migrated. `npm uninstall -g @deelin221/agentporch` removes only installed commands and program files. Validate actual old-database migration fixtures whenever the schema changes.

## Requirement: Preserve release artifact identity

Record candidate package name, version, filename, and SHA-256. Installation matrices and publishing jobs download and verify the same tgz. Publishing must depend on candidate quality gates and the complete installation matrix, without rebuilding. Use the protected environment and OIDC Trusted Publisher.

After release, download from the public registry and compare the candidate digest. Do not claim external matrix or public-release verification when it has not actually run.

## Tests

- `pnpm exec tsx --test tests/specs/npm-global-distribution.spec.ts`
- `pnpm exec tsx --test tests/specs/backend-type-module-boundary.spec.ts`
