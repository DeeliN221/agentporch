# Remove workspace Git features

## Requirement: No workspace Git surface remains

The main workspace must not expose Git controls, restore obsolete Git docks, retain Git-panel source, or register `/api/git`.

### Scenario: UI and source entries exclude Git

Desktop and mobile tabs, titles, and docks do not show Git or GitPanel. `frontend/components/git-panel` does not exist. The workspace layout model rejects `git` panels.

### Scenario: The backend no longer supports the Git API

Do not mount Git routes for `/api/git`; `backend/routes/git.ts` must not exist.

### Scenario: Legacy layout state degrades safely

Stored `activeTab=git` or a right-side Git dock falls back to a supported tab without restoring a blank panel.

## Tests

- `tests/specs/workspace-git-removal.spec.ts`
- `tests/spec/workspace-git-removal-evidence.spec.ts`
