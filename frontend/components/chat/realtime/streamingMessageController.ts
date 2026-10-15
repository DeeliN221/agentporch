/**
 * PURPOSE: Own streaming message merge rules for realtime chat events.
 * Separate token appends and completion transitions from the long hook to preserve messages during navigation.
 */
import type { Dispatch, SetStateAction } from 'react';
import { chatMessageReducer } from '../state/chatMessageReducer';
import type { ChatMessage } from '../types/types';

export function appendStreamingChunk(
  setChatMessages: Dispatch<SetStateAction<ChatMessage[]>>,
  chunk: string,
  newline = false,
): void {
  /** Merge a streaming chunk with the reducer as the only state entry point. */
  if (!chunk) return;
  setChatMessages((previous) => chatMessageReducer({ messages: previous }, { type: 'streamingChunkAppended', chunk, newline }).messages);
}

export function finalizeStreamingMessage(setChatMessages: Dispatch<SetStateAction<ChatMessage[]>>): void {
  /** Commit the current streaming assistant message as a normal message. */
  setChatMessages((previous) => chatMessageReducer({ messages: previous }, { type: 'streamingMessageFinalized' }).messages);
}
