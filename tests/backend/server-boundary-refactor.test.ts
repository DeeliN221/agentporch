/**
 * Purpose: verify chat scope, command routing, and file helpers after the server boundary refactor.
 * Boundary errors can leak realtime events across users, expose expensive directories, or misreport permissions.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createChatClientScopeStore, normalizeChatClientScope } from '../../backend/server/realtime/chat-client-scope-store.ts';
import { buildChatCommandContext, dispatchChatCommand } from '../../backend/server/realtime/chat-command-router.ts';
import { permissionBitsToRwx, expandWorkspacePath } from '../../backend/server/files/file-route-helpers.ts';

test('chat-client-scope-store normalizes private realtime ownership', () => {
  /** Record private scope only when a provider session or request ID is present. */
  assert.equal(normalizeChatClientScope({}, 'u1'), null);
  const scope = normalizeChatClientScope({ sessionId: 'c1', provider: 'codex', cwd: '/repo' }, 'u1');
  assert.equal(scope?.agentporchSessionId, 'c1');
  const store = createChatClientScopeStore();
  const client = {};
  store.set(client, [scope!]);
  assert.equal(store.get(client).length, 1);
});

test('chat-command-router builds context and dispatches command', () => {
  /** The command router must preserve ws/request context and call the connection-level dispatcher. */
  const context = buildChatCommandContext({ a: 1 }, 'ws', 'req');
  assert.deepEqual(context, { deps: { a: 1 }, ws: 'ws', request: 'req' });
  let received: unknown = null;
  dispatchChatCommand((message) => { received = message; }, { type: 'ping' });
  assert.deepEqual(received, { type: 'ping' });
});

test('file-route-helpers preserve file metadata and workspace expansion', () => {
  /** File-route helpers must consistently render permissions and expand workspace paths correctly. */
  assert.equal(permissionBitsToRwx(5), 'r-x');
  assert.equal(expandWorkspacePath('~/demo', { WORKSPACES_ROOT: '/workspace', path: { join: (...parts: string[]) => parts.join('/') } }), '/workspace/demo');
});
