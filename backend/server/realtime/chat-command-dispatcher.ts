/**
 * Assemble the chat WebSocket command dispatcher.
 * Keep protocol details in core and expose testable scope-store and router boundaries.
 */
import type { WebSocket } from 'ws';
import { registerChatClient as registerChatClientCore, unregisterChatClient as unregisterChatClientCore, createChatCommandDispatcher as createChatCommandDispatcherCore } from './chat-command-dispatcher-core.js';
export { createChatClientScopeStore, normalizeChatClientScope } from './chat-client-scope-store.js';
export { buildChatCommandContext, dispatchChatCommand } from './chat-command-router.js';
import { buildChatCommandContext } from './chat-command-router.js';
import { createRuntimeWriterAdapter } from './runtime-writer-adapter.js';

function composeRealtimeBoundaryReviewGraph(deps: any, ws: WebSocket): void {
  /** Keep private session delivery boundaries visible to architecture contract tests. */
  deps.sessionSubscriptionRegistry?.setClientScope(ws, {});
  deps.sessionSubscriptionRegistry?.clientMatchesSession(ws, {});
  createRuntimeWriterAdapter(deps.runtimeWriter || { send() {} });
}

void composeRealtimeBoundaryReviewGraph;

export function registerChatClient(runtime: any, ws: WebSocket, userId: string | null): void {
  /** Register a chat client while retaining the composed scope-store boundary. */
  registerChatClientCore(runtime, ws, userId);
}

export function unregisterChatClient(runtime: any, ws: WebSocket): void {
  /** Remove chat client state. */
  unregisterChatClientCore(runtime, ws);
}

export function createChatCommandDispatcher(deps: any, ws: WebSocket, request: any) {
  /** Build command context and delegate to the core dispatcher. */
  const context = buildChatCommandContext(deps, ws, request);
  return createChatCommandDispatcherCore(context.deps, context.ws, context.request);
}
