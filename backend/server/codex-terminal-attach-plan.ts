/**
 * Decide whether a Codex terminal reconnects to tmux, attaches to a shared daemon, starts, or warns.
 * Require confirmation before creating a shared session from a legacy active-session card.
 */

export type CodexTerminalAttachPlan = {
  action: 'attach-tmux' | 'remote-tui' | 'new-shared-tui' | 'legacy-resume' | 'new-session' | 'blocked';
  commandArgs: string[] | null;
  reason: string | null;
  requiresAgentPorchServer: boolean;
  mayInterruptActiveTurn: boolean;
  sessionFailed: boolean;
};

/** Build a takeover plan from tmux, shared-runtime, and external activity state. */
export function resolveCodexTerminalAttachPlan(input: {
  providerSessionId: string | null;
  managedTmuxExists: boolean;
  forceHandoff?: boolean;
  sharedRuntime: {
    ready: boolean;
    endpoint: string | null;
    threadOwned?: boolean;
    threadReadable?: boolean;
    threadState?: 'active' | 'idle' | 'unknown';
    activeTurnDetected?: boolean;
    activeTurnOwned?: boolean;
  };
  externalSessionState: 'running' | 'idle' | 'unknown';
}): CodexTerminalAttachPlan {
  if (input.managedTmuxExists) {
    return { action: 'attach-tmux', commandArgs: null, reason: null, requiresAgentPorchServer: true, mayInterruptActiveTurn: false, sessionFailed: false };
  }
  const sharedThreadLoaded = input.sharedRuntime.threadOwned === true;
  const sharedThreadReadable = input.sharedRuntime.threadReadable === true;
  const threadState = input.sharedRuntime.threadState
    || (input.sharedRuntime.activeTurnDetected === true ? 'active' : sharedThreadReadable ? 'idle' : 'unknown');
  const activeTurnDetected = threadState === 'active';
  const sharedHandoffVerified = sharedThreadLoaded
    ? input.sharedRuntime.threadReadable !== false
    : sharedThreadReadable && threadState === 'idle';
  if (input.sharedRuntime.ready && input.sharedRuntime.endpoint && input.providerSessionId && sharedHandoffVerified) {
    return {
      action: 'remote-tui',
      commandArgs: ['--remote', input.sharedRuntime.endpoint, 'resume', input.providerSessionId],
      reason: sharedThreadLoaded ? null : 'historical-idle-thread-migrated',
      requiresAgentPorchServer: false, mayInterruptActiveTurn: false, sessionFailed: false,
    };
  }
  if (input.forceHandoff && input.sharedRuntime.ready && input.sharedRuntime.endpoint && input.providerSessionId) {
    return {
      action: 'new-shared-tui',
      commandArgs: null,
      reason: 'user-forced-legacy-handoff',
      requiresAgentPorchServer: false, mayInterruptActiveTurn: false, sessionFailed: false,
    };
  }
  if (input.sharedRuntime.ready && sharedThreadReadable && activeTurnDetected && !sharedThreadLoaded) {
    return {
      action: 'blocked', commandArgs: null,
      reason: 'external-active-session-not-shared',
      requiresAgentPorchServer: false, mayInterruptActiveTurn: false, sessionFailed: false,
    };
  }
  if (input.sharedRuntime.ready && input.providerSessionId && (!sharedThreadReadable || threadState === 'unknown')) {
    return {
      action: 'blocked', commandArgs: null,
      reason: 'shared-thread-state-unavailable',
      requiresAgentPorchServer: false, mayInterruptActiveTurn: false, sessionFailed: false,
    };
  }
  if (input.externalSessionState === 'running' || (input.externalSessionState === 'unknown' && Boolean(input.providerSessionId))) {
    return {
      action: 'blocked', commandArgs: null,
      reason: input.externalSessionState === 'running'
        ? 'external-active-session-not-shared'
        : 'external-session-sharing-unknown',
      requiresAgentPorchServer: false, mayInterruptActiveTurn: false, sessionFailed: false,
    };
  }
  if (input.providerSessionId) {
    return {
      action: 'legacy-resume', commandArgs: ['resume', input.providerSessionId], reason: 'shared-runtime-unavailable',
      requiresAgentPorchServer: false, mayInterruptActiveTurn: false, sessionFailed: false,
    };
  }
  return { action: 'new-session', commandArgs: [], reason: null, requiresAgentPorchServer: false, mayInterruptActiveTurn: false, sessionFailed: false };
}
