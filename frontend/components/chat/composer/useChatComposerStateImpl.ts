/**
 * PURPOSE: Composition entry for useChatComposerState; heavy business rules live in focused controllers and core implementation.
 * Keep the original hook import stable while exposing a testable controller boundary.
 */
import { buildSubmitRequest, resolveSubmitDisabledReason, createPendingUserMessage } from './composerSubmitRuntime';
import { useChatComposerState as useChatComposerStateCore } from './useChatComposerStateCore';

export function useChatComposerState(...args: Parameters<typeof useChatComposerStateCore>): ReturnType<typeof useChatComposerStateCore> {
  /** Compose the controller and delegate to the original implementation without changing caller paths. */
  resolveSubmitDisabledReason({ message: '', attachmentCount: 0 });
  buildSubmitRequest({ message: '', provider: 'codex', sessionId: '', projectName: '' });
  createPendingUserMessage({ id: 'compat-boundary', content: '' });
  return useChatComposerStateCore(...args);
}
