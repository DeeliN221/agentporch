/**
 * PURPOSE: Keep chat session lifecycle calculations outside the React hook.
 * Centralize loading plans, results, and visible windows to preserve messages during session switches.
 */
import type { ChatMessage } from '../types/types';
import { getIntrinsicMessageKey } from '../utils/messageKeys';

export function buildSessionLoadPlan(input: { loadMore?: boolean; offset?: number; pageSize?: number; total?: number }) {
  /** Compute pagination parameters for one session-messages request. */
  const loadMore = input.loadMore === true;
  const offset = loadMore ? Math.max(0, input.offset || 0) : 0;
  const limit = Math.max(1, input.pageSize || 50);
  return { loadMore, offset, limit, hasKnownTotal: typeof input.total === 'number' && input.total >= 0 };
}

export function applySessionLoadResult<TMessage>(previous: TMessage[], result: { messages?: TMessage[]; total?: number; nextMessageOffset?: number; nextRawLineOffset?: number }, loadMore = false) {
  /** Merge loaded results, preferring server-provided pagination cursors. */
  const incoming = Array.isArray(result.messages) ? result.messages : [];
  const messages = loadMore ? [...previous, ...incoming] : incoming;
  return { messages, total: typeof result.total === 'number' ? result.total : messages.length, nextOffset: result.nextMessageOffset ?? result.nextRawLineOffset ?? messages.length };
}

export function getVisibleWindowMessageKey<TMessage>(message: TMessage, index: number): string {
  /** Build stable visible-window anchors, including converted messages lacking messageKey. */
  const chatMessage = message as ChatMessage;
  const intrinsicKey = getIntrinsicMessageKey(chatMessage);
  if (intrinsicKey) {
    return intrinsicKey;
  }

  const timestamp = chatMessage.timestamp instanceof Date
    ? chatMessage.timestamp.toISOString()
    : String(chatMessage.timestamp ?? '');
  const content = typeof chatMessage.content === 'string' ? chatMessage.content.slice(0, 120) : '';
  return `message-fallback:${chatMessage.type}:${timestamp}:${content}` || `message-position-${index}`;
}

export function buildVisibleMessageWindow<TMessage>(messages: TMessage[], visibleCount: number, frozenTailKey: string | null = null): TMessage[] {
  /** Return the trailing messages currently visible in the chat window. */
  const count = Number.isFinite(visibleCount) ? Math.max(0, visibleCount) : messages.length;
  const frozenTailIndex = frozenTailKey
    ? messages.findIndex((message, index) => getVisibleWindowMessageKey(message, index) === frozenTailKey)
    : -1;
  const end = frozenTailIndex >= 0 ? frozenTailIndex + 1 : messages.length;
  return messages.slice(Math.max(0, end - count), end);
}
