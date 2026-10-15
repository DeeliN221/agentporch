/**
 * Define the stable chat WebSocket entry.
 * Keep the HTTP gateway dependent on this entry while realtime dispatch owns protocol commands.
 */
import type { WebSocket } from 'ws';
import { createChatCommandDispatcher, registerChatClient, unregisterChatClient } from './realtime/chat-command-dispatcher.js';
import { parseChatMessage, type ChatInboundMessage } from './realtime/chat-message-schema.js';

/**
 * Handle the chat WebSocket connection lifecycle.
 */
export function handleChatConnection(deps: any, ws: WebSocket, request: any): void {
  /**
   * PURPOSE: Keep the executable WebSocket handler as a transport boundary:
   * parse inbound messages, invoke the protocol dispatcher, and release state on close.
   */
  const dispatcher = createChatCommandDispatcher(deps, ws, request);

  ws.on('message', async (message: Buffer | string) => {
    let data: ChatInboundMessage | null = null;
    try {
      data = parseChatMessage(message);
      await dispatcher.dispatchChatCommand(data);
    } catch (error: any) {
      dispatcher.sendProtocolError(data, error);
    }
  });

  ws.on('close', dispatcher.close);
}

export {
  registerChatClient,
  unregisterChatClient,
};
