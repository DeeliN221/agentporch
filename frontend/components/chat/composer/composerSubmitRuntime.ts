/**
 * PURPOSE: Own composer submit request calculations outside the React hook.
 * Make submit guards, request payloads, and pending user messages testable to prevent duplicate sends.
 */
export function resolveSubmitDisabledReason(input: { isLoading?: boolean; isProcessing?: boolean; message?: string; attachmentCount?: number }): string | null {
  /** Return the reason a user-initiated submission must be blocked. */
  if (input.isLoading) return 'loading';
  if (input.isProcessing) return 'processing';
  if (!String(input.message || '').trim() && !input.attachmentCount) return 'empty';
  return null;
}

export function buildSubmitRequest(input: { message: string; provider: string; sessionId?: string | null; projectName?: string | null; attachments?: unknown[] }) {
  /** Build the stable submission request sent to the backend. */
  return { message: input.message, provider: input.provider, sessionId: input.sessionId || null, projectName: input.projectName || null, attachments: input.attachments || [] };
}

export function createPendingUserMessage(input: { id: string; content: string; attachments?: unknown[] }) {
  /** Create an optimistic user message pending realtime or persisted confirmation. */
  return { id: input.id, type: 'user' as const, content: input.content, attachments: input.attachments || [], deliveryStatus: 'pending' as const };
}
