# Specification: repository simplification

## Requirements: dependencies and assets

Neither `package.json` dependencies nor lockfile resolutions may include `lucide-react`. Frontend source cannot import it or use `LucideIcon`. Retained sidebar, settings, file, Git, chat, and workflow actions keep accessible names; tests assert behavior or `aria-label`, not icon component names.

`index.html` must retain the frontend entry script without references to deleted `/favicon.svg`, `/favicon.png`, `/favicon.ico`, or `/icons/icon-*.png`. PWA entry points use existing `/manifest.webmanifest` and `/pwa/` assets. The manifest remains valid JSON, each icon exists under `public/`, and it contains no removed `/icons/` entries. Authentication, provider selection, and settings do not request removed `/logo.svg`, `/icons/codex.svg`, `/icons/codex-white.svg`, or `/icons/claude-ai-icon.svg`. Providers remain recognizable through text or existing components.

## Requirements: cleanup scope

Simplification modifies tracked files (`git ls-files`) and intentional new source/test/docs paths only. It does not delete, move, or reformat ignored runtime data, caches, dependencies, generated builds, or local tool state: `node_modules/`, `dist/`, `.wo/`, `.agents/cache/`, `.openspec/cache/`, `tests/test-results/`, `authdb/`, databases, or logs. Report ignored leftovers separately. Normal build/test commands may generate their own outputs; such files are not cleanup targets.

## Requirements: frontend boundaries

A `view/subcomponents` component used by one parent, without independent state, complex effects, or reusable tests, can be merged into that parent or its domain-local module. Single-consumer types/constants/utilities with only one or two local exports should be inlined into the consuming domain. Preserve UI behavior and accessible names.

Do not flatten meaningful boundaries for chat-tool rendering, Markdown/Mermaid editing, workflow detail, or shell connection management merely to reduce file count; remove only unreferenced remnants and duplicate props there. Remove empty retired i18n keys, unused prop forwarding, tab types, icon adapters, and UI entries serving deleted assets.

## Requirements: backend compatibility

Project/session/workflow/Git/Shell/diagnostic contracts remain stable. Project names, paths, session/workflow collections where appropriate, provider states, and visibility rules stay compatible; removed metadata is not reintroduced. Route/session classification for manual `cN`, workflow children, and provider drafts has one tested helper rather than duplicate regex/string-splitting implementations.

Application state uses the documented AgentPorch paths. Provider transcript and workflow-tool paths follow their respective external contracts. Runtime diagnostics share executable lookup, PATH diagnosis, and error formatting, retaining readable missing-command messages.

## Requirements: traceable distribution

Each retained `scripts/` entry has a caller in package scripts, README, source, or tests. Unreferenced scripts do not enter the published package. Each public asset is referenced by HTML, manifest, frontend source, backend static serving, or README. Unreferenced icon/PWA generators, cache-cleaning pages, and service-worker retirement files are removed or become test helpers as appropriate.

The npm `files` allowlist includes only compiled backend/shared/frontend output, necessary scripts, and runtime documentation; historical diagnostic tools and tests are excluded.

## Requirements: retired identifiers and APIs

Application-owned paths and identifiers consistently use `agentporch`, `AgentPorch`, or `AGENTPORCH`, according to their naming convention.

Web authentication uses exactly 32 characters from `AGENTPORCH_ACCESS_TOKEN`; localhost first-user behavior cannot bypass login. Removed co clients cannot read `AGENTPORCH_CO_HOME`.

`settingsStorage.ts` keeps `AGENTPORCH_SETTINGS_KEY` with value `agentporch-settings` for user-data compatibility. Consumers import `readAgentPorchSettings`. No `LEGACY_PROVIDER_SETTINGS_KEY` or fallback to `claude-settings` remains; an absent current key yields an empty object.

`normalizeMainTab` in `useSettingsController.ts` does not special-case retired `tools`, `tasks`, `git`, or `api` tabs. Unknown tabs fall back to `appearance`. `StandaloneShell` has no unused `compact?: boolean` prop or `void compact`; `MicButton` has no unused `mode?: string` prop, and `CommitComposer` does not pass one.

## Validation commands

- `pnpm exec tsx --test tests/manual/node-history/repo-simplification-boundary.ts`
- `pnpm exec tsx --test tests/spec/test_suite_taxonomy.ts`

Cleanup must preserve existing functional coverage and user workflows.
