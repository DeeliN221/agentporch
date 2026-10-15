/**
 * PURPOSE: Store and normalize chat WebSocket client scopes.
 * Centralize private realtime session ownership to prevent cross-window delivery.
 */
export type ChatClientScope = { userId: string | null; projectName: string; projectPath: string; provider: string; agentporchSessionId: string; providerSessionId: string; clientRequestId: string };

export function normalizeChatClientScope(scope: Record<string, any>, userId: string | null): ChatClientScope | null {
  /** Normalize browser-declared chat scope fields. */
  const agentporchSessionId = String(scope.agentporchSessionId || scope.agentporch_session_id || scope.sessionId || '').trim();
  const providerSessionId = String(scope.providerSessionId || scope.provider_session_id || '').trim();
  const clientRequestId = String(scope.clientRequestId || scope.client_request_id || scope.startRequestId || scope.start_request_id || '').trim();
  if (!agentporchSessionId && !providerSessionId && !clientRequestId) return null;
  return { userId, projectName: String(scope.projectName || scope.project_name || '').trim(), projectPath: String(scope.projectPath || scope.project_path || scope.cwd || '').trim(), provider: String(scope.provider || '').trim(), agentporchSessionId, providerSessionId, clientRequestId };
}

export function createChatClientScopeStore() {
  /** Create a scope store isolated by WebSocket identity. */
  const scopes = new WeakMap<object, ChatClientScope[]>();
  return { get: (client: object) => scopes.get(client) || [], set: (client: object, next: ChatClientScope[]) => scopes.set(client, next.slice(-20)), clear: (client: object) => scopes.delete(client) };
}
