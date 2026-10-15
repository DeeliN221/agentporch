# Provider terminology and historical test assets

## Requirement: Describe current provider boundaries accurately

Production code and maintained specifications must describe the actual runtime: Codex uses app-server, Pi SDK paths use the native SDK where applicable, and shared behavior is described as provider runtime. Historical records preserve facts from their own time and are not authority for the current architecture.

Searching `backend/`, `frontend/`, `docs/specs/`, and package scripts must not present retired direct SDK/thread connections as the current Codex path or the retired co-file protocol as the manual-message path.

## Requirement: Name tests after the behavior they exercise

Filenames, PURPOSE comments, and test titles must identify the actual path. App-server tests must not imply a native Codex SDK. Pi SDK tests may retain accurate SDK terminology. References to retired dependencies in negative assertions must have explicit negative meaning. Preserve third-party package names and source provenance.

## Requirement: Account for manual browser-history assets

Every current `tests/manual/browser-history` file must appear in `docs/testing/manual-history-inventory.md` with one of: Migrated, Manual only, Pending removal, or Pending decision. Manual-only entries must state current business value, prerequisites, and evidence locations. No unprocessed default-gate candidate remains after the inventory is completed.

`tests/README.md` must state that manual/browser-history is outside default gates. Default test results must not claim those live/manual cases were executed. Unclear-value assets require a decision before removal.

## Tests and limitations

`tests/specs/historical-provider-wording-assets.spec.ts` inspects actual source, test names, specifications, README guidance, and inventory files. Historical records are preserved outside the fresh public snapshot; they are not mechanically rewritten to imply that current behavior existed earlier.
