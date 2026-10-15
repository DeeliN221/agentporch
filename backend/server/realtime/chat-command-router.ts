/**
 * PURPOSE: Route inbound chat commands to the existing dispatcher boundary.
 * Separate context construction and dispatch from WebSocket connection handling.
 */
export function buildChatCommandContext(deps: any, ws: any, request: any) {
  /** Build chat-command dispatch context. */
  return { deps, ws, request };
}

export function dispatchChatCommand(dispatcher: (message: unknown) => void, message: unknown): void {
  /** Invoke the current connection command dispatcher. */
  dispatcher(message);
}
