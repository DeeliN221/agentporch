# Pi session timestamps

## Requirement: Display actual activity time

### Scenario: Historical sessions are not presented as recent

If the last transcript activity was two hours ago, the card must communicate that age rather than showing "just now".

### Scenario: Future timestamps are not presented as recent

If a clock or unit problem places activity 30 minutes in the future, show an unambiguous absolute time or unknown time, never "just now".

### Scenario: Normalize epoch seconds

Convert second-based epoch strings to milliseconds before formatting the historical relative time or date.

## Requirement: Preserve other providers' timestamp behavior

Valid Codex ISO activity timestamps continue using existing relative-time rules. Pi timestamp corrections must not change sort-field precedence.
