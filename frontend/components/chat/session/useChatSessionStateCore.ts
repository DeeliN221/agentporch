/**
 * PURPOSE: Keep chat session hook compatibility as a thin boundary.
 * Controllers own session loading and visible windows; this file preserves the old internal entry.
 */
export { useChatSessionState } from './useChatSessionStateRuntime';
