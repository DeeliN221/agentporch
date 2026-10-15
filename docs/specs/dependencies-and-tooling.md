# Dependencies and tooling index

Detailed requirements are split by domain so one specification does not accumulate unrelated topics:

- [Repository simplification](repo-simplification.md)
- [TypeScript tooling and test entry points](typescript-tooling.md)
- [Runtime diagnostics and manual sessions](runtime-dependencies.md)
- [Provider indexing and session sources](provider-indexing.md)
- [Workflow state and compatibility](workflow-compatibility.md)
- [Chat performance, virtualization, and refresh](chat-performance.md)

## Requirement: Keep dependency requirements traceable

A reviewer looking for an earlier dependency or tooling requirement must be able to navigate from this index to its focused specification, executable tests, and source owner.

## Tests

- `pnpm exec tsx --test tests/specs/spec-docs-boundary.spec.ts`
- `pnpm exec tsx --test tests/spec/test_suite_taxonomy.ts`
