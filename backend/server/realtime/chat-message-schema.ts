/**
 * Normalize inbound chat WebSocket commands.
 * Parse Codex, abort, and subscription commands consistently; Pi/Claude use the tmux TUI only.
 */

export type ChatCommandType =
  | 'claude-command'
  | 'codex-command'
  | 'pi-command'
  | 'abort-session'
  | 'claude-permission-response'
  | 'subscribe-session'
  | 'check-session-status'
  | 'get-active-sessions'
  | 'ping';

export type ChatInboundMessage = Record<string, any> & { type?: ChatCommandType | string };

/**
 * Parse a raw WebSocket message into the loose command object used by legacy handlers.
 */
export function parseChatMessage(message: Buffer | string): ChatInboundMessage {
  return JSON.parse(String(message)) as ChatInboundMessage;
}
