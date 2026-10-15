# Incremental session-message reads

## Requirement: Read only appended JSONL data

When the browser supplies a raw-line cursor, do not read the entire JSONL file. A normal append refresh starts at the cached previous EOF byte position.

### Scenario: Codex tail reads

After an initial read establishes a cursor, append two messages and request `getCodexSessionMessages(sessionId, null, 0, afterLine)` using the old total. Return only the appended messages while keeping `total` equal to the complete nonempty raw-line count. Never call `FileHandle.readFile()` on the JSONL file. A cache hit must not rescan from byte zero.

### Scenario: Pi tail reads

Apply the same contract to `getPiSessionMessages(sessionId, null, 0, afterLine)`: appended messages only, complete raw-line total, no full-file read, and cached-EOF starting position.

## Requirement: Preserve cursor and ordering semantics

### Scenario: Cursor boundaries

When afterLine equals or exceeds the current line count, return no new messages and report the current total without replaying old messages. A cache miss with `afterLine=0` still returns existing history. Truncation and replacement may fall back to a safe full scan; correctness takes precedence on those exceptional paths.

### Scenario: Raw-line history pagination

One raw line may produce zero, one, or several UI messages. History responses must expose `nextRawLineOffset`. Adjacent pages using that cursor must not overlap raw lines. The frontend must not derive its next offset from `messages.length`.

## Tests and evidence

- `pnpm exec tsx --test tests/specs/session-incremental-read.spec.ts` creates isolated HOME directories with actual Codex/Pi JSONL shapes. It verifies cache-hit tail reads, bans FileHandle.readFile, checks cursor boundaries, and confirms no duplicated history prefixes.
- `pnpm exec tsx --test tests/specs/codex-history-message-order.spec.ts` creates actual multi-turn histories with internal messages, repeated user echoes, and many tool calls. It verifies nextRawLineOffset and nonoverlapping pages.

## Remaining risks

A process-local cursor cache miss may scan from the start. If Pi stops using append-only transcripts, it will require a separate recovery strategy. Frontends must continue consuming backend cursors rather than inventing message-count offsets.
