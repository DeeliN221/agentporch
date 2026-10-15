/**
 * PURPOSE: Keep chat command dispatcher compatibility as a thin boundary.
 * Keep the historical entry while chat-command-runtime owns realtime commands.
 */
export {
  createChatCommandDispatcher,
  registerChatClient,
  unregisterChatClient,
} from './chat-command-runtime.js';
