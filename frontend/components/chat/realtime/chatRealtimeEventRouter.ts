/**
 * PURPOSE: Route realtime chat event names into stable UI actions.
 * Centralize session/realtime event classification instead of scattering protocol strings across hooks.
 */
export type ChatRealtimeRoute = 'session' | 'stream' | 'permission' | 'status' | 'unknown';

export function routeChatRealtimeEvent(message: { type?: string; [key: string]: unknown } | null | undefined): ChatRealtimeRoute {
  /** Choose the chat controller responsible for a backend event. */
  const type = String(message?.type || '');
  if (/stream|content|delta/i.test(type)) return 'stream';
  if (/permission/i.test(type)) return 'permission';
  if (/session|created|reloaded/i.test(type)) return 'session';
  if (/complete|failed|aborted|processing|status/i.test(type)) return 'status';
  return 'unknown';
}

export function applyRealtimeSessionEvent<TSession extends { id?: string } | null>(
  currentSession: TSession,
  event: { sessionId?: string | null; actualSessionId?: string | null },
): { sessionId: string | null; matchesCurrentSession: boolean } {
  /** Normalize the realtime session ID and check whether it belongs to the active session. */
  const sessionId = event.actualSessionId || event.sessionId || null;
  return { sessionId, matchesCurrentSession: Boolean(sessionId && currentSession?.id === sessionId) };
}
