# Pi sending, follow-up, steering, and refresh recovery

## Requirement: Persist ordinary messages and recover after refresh

From a real project overview, create a Pi session and send an ordinary request. Both the user message and response must appear. After refresh both remain visible exactly once.

## Requirement: Follow-up messages reuse the session

After the first turn completes, a follow-up request enters the same transcript. After refresh, both rounds appear without duplication.

## Requirement: Preserve steering state during active work

During a long task, send new input as a steer request. Display the Pi queue/steering state. When the run finishes, persist the steering user message and corresponding response.

## Requirement: Reconcile live and persisted views without loss

The runtime emits live events, writes the transcript, and emits completion. When completion refreshes the read model, live and persisted copies must not render twice. Refresh must retain every completed message.
