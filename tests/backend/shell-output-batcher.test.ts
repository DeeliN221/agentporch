/**
 * Purpose: verify provider TUI output throttling, the interaction fast path, and bounded recovery buffers.
 * Remote connections must reduce status-frame traffic without delaying input feedback or accumulating unbounded replay data.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import type { WebSocket } from 'ws';
import {
  PROVIDER_TUI_OUTPUT_INTERVAL_MS,
  SHELL_REPLAY_BATCH_LIMIT,
  flushShellOutput,
  markShellOutputInteractive,
  queueShellOutput,
  resetShellOutputQueue,
  type ShellOutputSession,
} from '../../backend/server/shell-output-batcher.ts';

const OPEN = 1;
const WebSocketState = { OPEN };

/**
 * Create a lightweight WebSocket session recording only frames sent by the server.
 */
function createSession(): { session: ShellOutputSession; messages: string[] } {
  const messages: string[] = [];
  const ws = {
    readyState: OPEN,
    send(payload: string) {
      messages.push(payload);
    },
  } as unknown as WebSocket;

  return {
    session: { ws, buffer: [] },
    messages,
  };
}

/**
 * Wait for real timers to cover the production macrotask batching boundary.
 */
async function wait(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

test('Provider TUI burst is merged into one scheduled websocket frame', async () => {
  const { session, messages } = createSession();

  assert.equal(PROVIDER_TUI_OUTPUT_INTERVAL_MS, 16);

  queueShellOutput({ session, data: 'first', isPlainShell: false, WebSocketState, intervalMs: 20 });
  queueShellOutput({ session, data: ' second', isPlainShell: false, WebSocketState, intervalMs: 20 });

  assert.equal(messages.length, 0);
  await wait(35);
  assert.equal(messages.length, 1);
  assert.deepEqual(JSON.parse(messages[0]), { type: 'output', data: 'first second' });
  resetShellOutputQueue(session);
});

test('interactive TUI output uses the short feedback delay', async () => {
  const { session, messages } = createSession();

  markShellOutputInteractive(session, WebSocketState, 5);
  queueShellOutput({
    session,
    data: 'typed response',
    isPlainShell: false,
    WebSocketState,
    intervalMs: 100,
    interactiveDelayMs: 5,
  });

  await wait(15);
  assert.equal(messages.length, 1);
  assert.deepEqual(JSON.parse(messages[0]), { type: 'output', data: 'typed response' });
  resetShellOutputQueue(session);
});

test('plain shell output stays immediate', () => {
  const { session, messages } = createSession();

  queueShellOutput({ session, data: 'prompt', isPlainShell: true, WebSocketState });

  assert.equal(messages.length, 1);
  assert.deepEqual(JSON.parse(messages[0]), { type: 'output', data: 'prompt' });
});

test('fallback replay keeps only the latest merged batches', () => {
  const session: ShellOutputSession = { ws: null, buffer: [] };

  for (let index = 0; index < SHELL_REPLAY_BATCH_LIMIT + 5; index += 1) {
    session.pendingOutput = `batch-${index}`;
    flushShellOutput(session, WebSocketState);
  }

  assert.equal(session.buffer?.length, SHELL_REPLAY_BATCH_LIMIT);
  assert.equal(session.buffer?.[0], 'batch-5');
});
