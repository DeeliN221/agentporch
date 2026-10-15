# Test performance and quality gates

`pnpm run test:fast` runs typechecks, Vitest, and server smoke for local changes without full browser e2e. `test:smoke` adds e2e smoke after fast checks for entry-page and session-path changes. `test:full` runs typechecks, Vitest, complete Node regression, and complete browser regression. `pnpm test` delegates to full coverage.

Release CI checks the same commit in parallel: the candidate package runs `test:ci` (types, Vitest, backend, and Node specifications); reusable Browser regression discovers full specs/e2e through `playwright.spec.config.ts` across eight shards without duplicating each test. Every shard must pass; focused tests fail CI. Publishing waits for browser, candidate-package, and cross-platform installation checks; failure, cancellation, or timeout blocks publication.

Browser regression can run manually without publishing and retains failure screenshots, traces, and HTML reports. `tests/manual` is outside automated full coverage. Real Codex daemon takeover acceptance in `playwright.real.config.ts` requires prepared services/accounts and runs separately.

## Timing baselines

`pnpm run qa:test:timing` invokes `scripts/collect-test-timings.ts`, measuring typechecks, Vitest, and server smoke into `test-results/test-performance/latest.json`. `qa:test:timing:fast`, `:smoke`, and `:full` select predefined commands through `AGENTPORCH_TEST_TIMING_PROFILE` and write `fast.json`, `smoke.json`, and `full.json` in that directory. `AGENTPORCH_TEST_TIMING_OUTPUT` overrides the output path.

Results include command ID/text, `durationMs`, `exitCode`, `startedAt`, and `finishedAt`. A failed command retains its nonzero code and makes collection fail; broken baselines are never recorded as successful.

To measure a custom command:

```sh
AGENTPORCH_TEST_TIMING_COMMANDS='[{"id":"fast","command":"pnpm","args":["run","test:fast"]}]' pnpm run qa:test:timing
```

Use fast checks during small edits, smoke for page/session integration, and full checks before merging/releasing or after test-infrastructure/cross-module changes. Compare both timings and exit codes before and after performance changes.
