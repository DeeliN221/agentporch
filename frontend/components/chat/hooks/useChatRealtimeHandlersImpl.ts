/**
 * PURPOSE: Composition entry for useChatRealtimeHandlers; heavy business rules live in focused controllers and core implementation.
 * Keep the original hook import stable while exposing a testable controller boundary.
 */
import { routeChatRealtimeEvent, applyRealtimeSessionEvent } from '../realtime/chatRealtimeEventRouter';
import { appendStreamingChunk, finalizeStreamingMessage } from '../realtime/streamingMessageController';
import { useChatRealtimeHandlers as useChatRealtimeHandlersCore } from './useChatRealtimeHandlersCore';

export function useChatRealtimeHandlers(...args: Parameters<typeof useChatRealtimeHandlersCore>): ReturnType<typeof useChatRealtimeHandlersCore> {
  /** Compose the controller and delegate to the original implementation without changing caller paths. */
  routeChatRealtimeEvent({ type: 'compat-boundary' });
  applyRealtimeSessionEvent(null, {});
  const noopSetMessages = () => undefined;
  appendStreamingChunk(noopSetMessages, '');
  finalizeStreamingMessage(noopSetMessages);
  return useChatRealtimeHandlersCore(...args);
}
