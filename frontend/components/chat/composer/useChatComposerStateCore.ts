/**
 * PURPOSE: Keep chat composer hook compatibility as a thin boundary.
 * Controllers own submit guards, payloads, and pending messages; this file preserves the old internal entry.
 */
export { useChatComposerState } from './useChatComposerStateRuntime';
