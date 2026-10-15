/**
 * Purpose: ensure earlier turns do not misclassify activity in unloaded historical Codex threads.
 * Only historical threads confirmed idle can safely migrate to the shared daemon.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyCodexThreadActivity } from '../../backend/domains/codex-app-server/shared-thread-probe.ts';

test('a completed final turn overrides earlier unfinished turns', () => {
  /** Stale historical state must not permanently prevent recovery of a completed session. */
  const state = classifyCodexThreadActivity({
    status: { type: 'notLoaded' },
    turns: [
      { status: 'interrupted', completedAt: null },
      { status: 'completed', completedAt: 1780000000 },
    ],
  });
  assert.equal(state, 'idle');
});

test('an explicitly active final turn is classified as active', () => {
  /** Do not migrate while either the shared or private runtime explicitly reports activity. */
  assert.equal(classifyCodexThreadActivity({
    status: { type: 'notLoaded' },
    turns: [{ status: 'inProgress', completedAt: null }],
  }), 'active');
});

test('an unfinished interrupted final turn remains unknown', () => {
  /** The daemon may map an active turn from another private app-server to this state; conservatively block it. */
  assert.equal(classifyCodexThreadActivity({
    status: { type: 'notLoaded' },
    turns: [{ status: 'interrupted', completedAt: null }],
  }), 'unknown');
});

test('loaded thread activity takes precedence over turn snapshots', () => {
  /** The loaded thread-level state comes directly from the shared daemon. */
  assert.equal(classifyCodexThreadActivity({
    status: { type: 'active' },
    turns: [],
  }), 'active');
});
