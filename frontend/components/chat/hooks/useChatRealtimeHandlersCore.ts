/**
 * PURPOSE: Keep chat realtime hook compatibility as a thin boundary.
 * Controllers own realtime routing and streaming merges; this file preserves the old internal entry.
 */
export { useChatRealtimeHandlers } from './useChatRealtimeHandlersRuntime';
