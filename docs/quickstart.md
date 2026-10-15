# Quick Start

---

This guide separates npm releases, candidate-package acceptance, and source development paths.

## 1. Choose an installation path

### Current source installation

For source development, build and run the repository:

```sh
git clone https://github.com/DeeliN221/agentporch.git
cd agentporch
pnpm install --frozen-lockfile
pnpm run build
node dist-node/backend/cli.js
```

Run `npm pack` to produce a local candidate archive for global installation. Old release archives are not carried into this repository.

### Registry installation

AgentPorch is available on npm. On a supported platform, only Node.js 24 (24.17.0 or newer) or Node.js 26 (26.4.0 or newer) is required:

```sh
npm install -g @deelin221/agentporch && agentporch
```

The release workflow verifies the package before publishing the same archive to npm and GitHub Releases. Git, pnpm, TypeScript, and frontend build tools are not required.

### Publish a new version (maintainers)

AgentPorch is published as `@deelin221/agentporch`. Before using GitHub Actions for releases, configure the npm Trusted Publisher with owner `DeeliN221`, repository `agentporch`, and workflow `npm-release.yml`; leave the environment empty to match the workflow.

There is no local file edit, release branch, or version PR. In GitHub, open **Actions → Release → Run workflow**, select `main`, enter a version (for example, `1.4.23`; `v1.4.23` is also accepted), and start the run.

The workflow verifies that it started from the latest `main`, sets the candidate package's `package.json` and npm lockfile to the requested version, and lists first-parent commit messages since the previous release in the new CHANGELOG entry and GitHub Release notes. After the candidate passes all checks and is published to npm, the workflow creates a version tag and GitHub Release for that `main` commit.

Alternatively, run `pnpm run release -- 1.4.23` locally to push a version tag after checking that `main` is current and the working tree is clean.

Before publishing, all type checks, Vitest/backend/Node specification tests, full browser specification and E2E tests (eight shards), build and package checks, Linux/macOS/Windows installation checks on Node.js 24/26, and startup checks without optional dependencies must pass. Any failure or timeout blocks npm publishing and the GitHub Release. Browser failure reports are available as Actions artifacts. Run **Browser regression** manually to check browsers without publishing a version.

Automation excludes acceptance tests under `tests/manual` that require real accounts, external services, or a manually prepared environment, such as real Codex daemon handoff. Run these separately with the required environment.

### Candidate-package acceptance (current release testing)

Install only a `.tgz` supplied by the maintainers or built from this repository:

```sh
npm install -g ./package.tgz
agentporch --version
agentporch
```

Replace `package.tgz` with the actual candidate tarball filename.

Candidate packages have not completed release acceptance. When testing an older candidate that predates first-run initialization, pass an explicit 32-character token to that process:

```sh
AGENTPORCH_ACCESS_TOKEN="$(openssl rand -hex 16)" agentporch
```

Include the operating system, architecture, Node.js version, and candidate version in test reports.

## 2. First run and sign-in

The stable release contract is:

1. `agentporch` idempotently creates the private user directory `~/.agentporch`.
2. When no access token exists, it generates an `AGENTPORCH_ACCESS_TOKEN` containing exactly 32 characters and writes it to `~/.agentporch/.env`.
3. It prints the login URL. An interactive terminal prints a newly generated token once; non-interactive runs never write it to logs, so read it from the private `~/.agentporch/.env` file.
4. The server listens only on `127.0.0.1:3001` by default. Open `http://127.0.0.1:3001`, then enter the token; no account registration is required.

Subsequent runs must not replace an existing token, database, or internal JWT secret. Inspect the effective version, paths, and configuration with:

```sh
agentporch status
```

Data is stored under `~/.agentporch` by default, with SQLite at `~/.agentporch/agentporch.db`. Keep the database on local storage; do not place the SQLite database on NFS, SMB/CIFS, WebDAV, or another network filesystem.

## 3. Optional capabilities and diagnostics

The base Web workbench does not require `oz`, Codex, or Pi to start. A missing tool disables only its corresponding capability:

| Tool | Capability | Self-check |
|---|---|---|
| `oz` | `oz flow` workflows | `oz --version`, `oz flow contract --json` |
| Codex | Codex sessions | Install, authenticate, and run required services using the official Codex flow |
| Pi | Pi sessions | Install and authenticate using the official Pi flow |

agentporch diagnoses these external tools but does not install, authenticate, upgrade, or manage their processes. After startup, use runtime diagnostics in Settings; each missing item affects only its own feature.

`node-pty` is an optional Web-terminal dependency: without it, the base HTTP/Web UI starts normally but terminals are unavailable; reinstall optional dependencies to restore them.

## 4. Configuration and remote access

Explicit environment variables take precedence over `~/.agentporch/.env`. Common settings:

| Setting | Default | Purpose |
|---|---:|---|
| `HOST` | `127.0.0.1` | Server bind address |
| `PORT` | `3001` | Web UI, API, and WebSocket port |
| `DATABASE_PATH` | `~/.agentporch/agentporch.db` | SQLite database path |
| `AGENTPORCH_HOME` | `~/.agentporch` | User configuration and data root; set only in the parent process environment |
| `AGENTPORCH_ACCESS_TOKEN` | generated on first run | 32-character browser access token |
| `JWT_EXPIRES_IN` | `24h` | Login-token lifetime |

Remote access is optional. When required, explicitly change the bind address and access agentporch through a trusted HTTPS reverse proxy or tunnel:

```sh
HOST=0.0.0.0 agentporch
```

agentporch can read repositories, run shells, and access local provider configuration. Do not expose its port directly to the public Internet. Protect `AGENTPORCH_ACCESS_TOKEN`, `~/.agentporch`, and provider credentials, and restrict access at the reverse proxy. When using HTTPS, the PWA can be added to a phone's home screen.

## 5. Upgrade, rollback, and uninstall

Upgrade to the latest npm release with:

```sh
npm install -g @deelin221/agentporch
```

Install a specific version to roll back the program:

```sh
npm install -g @deelin221/agentporch@VERSION
```

For a candidate build, install the newer `.tgz` over the previous version:

```sh
npm install -g ./package.tgz
```

Uninstall the program with:

```sh
npm uninstall -g @deelin221/agentporch
```

If you installed the old `agentporch` package from a GitHub `.tgz`, run `npm uninstall -g agentporch` before installing `@deelin221/agentporch`. Upgrade, rollback, and uninstall preserve `~/.agentporch` by default. To permanently remove all local configuration, tokens, and databases after uninstalling, back them up first and then explicitly delete that directory yourself; agentporch never removes it automatically.

## 6. Source development

The source path is for contributors and is not the stable installation method. It requires Git, a Node.js version accepted by `engines.node`, and the pnpm version specified by the `packageManager` field in [package.json](../package.json).

```sh
git clone https://github.com/DeeliN221/agentporch.git
cd agentporch
corepack enable
pnpm install
pnpm run hooks:install
pnpm dev
```

If your Node.js environment does not include Corepack, install it using the official Corepack instructions or install the pnpm version named in `package.json` directly. The first source run also initializes `~/.agentporch/.env`. To isolate development data, set `AGENTPORCH_HOME`:

```sh
AGENTPORCH_HOME="$PWD/.tmp/agentporch-home" pnpm dev
```

Individual settings can also be overridden through process environment variables. Source development normally uses frontend `http://127.0.0.1:5173` and backend `http://127.0.0.1:3001`; the Vite development server has separate bind settings and must not be exposed to the public Internet.

Build and verify the production output with:

```sh
pnpm run build
pnpm start
```

Build a candidate package for local acceptance:

```sh
npm pack
npm install -g ./deelin221-agentporch-VERSION.tgz
```

## 7. Verify and troubleshoot

```sh
agentporch --version
agentporch status
curl http://127.0.0.1:3001/health
```

Then open the browser, enter the access token, and verify project files, terminals, and any installed provider capabilities. See [Troubleshooting](./troubleshooting_en.md) for common installation, port, sign-in, and provider issues.
