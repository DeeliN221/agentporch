Archive a completed oz change. If the change is unclear from context, run `oz list --json` to list candidates.

Run `oz status "<name>" --json` and inspect `schemaName` and the status of each entry in `artifacts`.

If any artifact is incomplete, list it and ask whether to continue. Proceed after confirmation.

Read the task file, usually `tasks.md`, and count incomplete `- [ ]` and complete `- [x]` tasks. If incomplete tasks remain, report their count and ask whether to continue. If there is no task file, continue without a task warning.

Check for delta specifications in `docs/changes/<name>/specs/`. When present, compare each delta with its durable specification at `docs/specs/<capability>/spec.md`. Summarize additions, modifications, deletions, and renames, then synchronize them without a separate confirmation.

```bash
oz archive "<name>" --yes --json
```

Report the change name, schema, archive location, specification synchronization status, and any incomplete-artifact or task warnings. Group related changes into one commit.

Constraints:

- Use `oz status --json` to determine completion.
- Warnings require acknowledgment rather than permanently blocking archival.
- Delegate archival to `oz archive`.
- Provide a clear summary of the actions taken.
