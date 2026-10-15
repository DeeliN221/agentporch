Create an oz change and the artifacts required for implementation: a proposal explaining what and why, a design explaining how, acceptance tests, and implementation tasks.

Understand the requested behavior and derive a numbered kebab-case name, such as `1-add-user-auth`. Choose the next sequence number from existing changes. The number and descriptive slug together form the change name.

```bash
oz create "<name>"
oz status "<name>" --json
```

The scaffold lives at `docs/changes/<name>/` and includes `.openspec.yaml`. Inspect `applyRequires` and the artifact dependency graph. Use the available task-tracking tool to record progress.

## Create artifacts in dependency order

For each artifact marked `ready`:

1. Read its completed dependencies for context.
2. Follow the current change schema and the repository's proposal, design, specification, and task conventions.
3. Use the provided template as structure, filling its sections.
4. Apply `context` and `rules` as constraints without copying those blocks into the artifact.
5. Write the missing file, verify that it exists, and report concise progress.
6. Run `oz status "<name>" --json` again.

Continue until every artifact in `applyRequires` has status `done`. Clarify materially missing information, but make reasonable routine decisions to maintain progress. If the name already exists, determine whether the user intends to continue it or create a new change.

## Acceptance tests

Create acceptance tests under `tests/spec/`, separate from other test categories. Read every relevant `specs/**/*.md` file and derive tests from its `#### Scenario:` blocks. Each WHEN/THEN scenario needs at least one test, grouped by specification.

Use the repository's existing framework; use pytest when no framework is established. Name files `tests/spec/test_<spec-name>.py` or the language-appropriate equivalent. Each test docstring identifies its specification scenario. Reuse established mock and fixture conventions.

Test observable requirements through public behavior, not implementation details. Write complete assertions for API and browser tests. Before implementation these tests should fail; do not use `pytest.skip` to hide missing behavior.

Example API assertions:

```python
class TestUserLogin:
    """Scenario: valid credentials start a session."""

    def test_valid_credentials_return_token(self, client):
        response = client.post('/auth/login', json={'username': 'alice', 'password': 'correct'})
        assert response.status_code == 200
        assert 'token' in response.json()

    def test_invalid_password_is_rejected(self, client):
        response = client.post('/auth/login', json={'username': 'alice', 'password': 'wrong'})
        assert response.status_code == 401
```

Example browser assertion:

```python
from playwright.sync_api import expect

class TestDashboard:
    def test_admin_sees_statistics(self, page):
        """WHEN an administrator opens the dashboard THEN statistics are visible."""
        page.goto('/dashboard')
        expect(page.locator('[data-testid="stats-panel"]')).to_be_visible()
```

Write a short `tests/spec/README.md` mapping test files to specifications and documenting the command. State that all acceptance tests must pass after implementation.

Create an executable `test_cmd.sh` in the change directory for oz's `test_cmd` field. Resolve the project root correctly from that location and run only the relevant acceptance tests. Exit status zero means acceptance passed; nonzero means failure.

Each task group ends with running its corresponding tests and confirming success. For example:

```markdown
## 1. Authentication

- [ ] 1.1 Implement the sign-in endpoint.
- [ ] 1.2 Issue session tokens.
- [ ] 1.3 Pass `pytest tests/spec/test_user_auth.py`.
```

## Delivery

Run `oz status "<name>"` and report the change name and location, created artifacts, number of acceptance tests and covered specifications, and readiness for implementation. Explain that `oz flow run <change-name>` starts execution.

Complete the artifact set, including tests and tasks, before presenting it together for review. Do not pause for separate approval of every artifact when the available context is sufficient.

During implementation, keep accepted tests as the fixed acceptance target. If a test is unreasonable, raise the issue for review rather than weakening assertions to obtain a pass. Preserve schema requirements and dependency ordering. Do not copy `<context>`, `<rules>`, or `<project_context>` into delivered documents.

Write artifacts in English by default. Provide translations when requested.
