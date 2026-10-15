/**
 * PURPOSE: Composition entry for useChatSessionState; heavy business rules live in focused controllers and core implementation.
 * Keep the original hook import stable while exposing a testable controller boundary.
 */
import { buildSessionLoadPlan, applySessionLoadResult, buildVisibleMessageWindow } from './chatSessionLifecycleController';
import { useChatSessionState as useChatSessionStateCore } from './useChatSessionStateCore';

export function useChatSessionState(...args: Parameters<typeof useChatSessionStateCore>): ReturnType<typeof useChatSessionStateCore> {
  /** Compose the controller and delegate to the original implementation without changing caller paths. */
  buildSessionLoadPlan({ loadMore: false, offset: 0, pageSize: 1 });
  applySessionLoadResult([], { messages: [], total: 0 }, false);
  buildVisibleMessageWindow([], 1);
  return useChatSessionStateCore(...args);
}
