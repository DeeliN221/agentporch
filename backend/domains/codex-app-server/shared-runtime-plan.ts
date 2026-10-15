/**
 * Plan the stdio proxy and Unix socket connection to the system Codex daemon.
 * AgentPorch validates only client connection prerequisites; the system owns service lifecycle and configuration.
 */

import path from 'node:path';
import type { CodexSharedRuntimeCapabilities } from './capability-probe.js';

export type SharedCodexRuntimePlan = {
  mode: 'shared-daemon' | 'unsupported';
  endpoint: string | null;
  socketPath: string | null;
  proxyArgs: string[] | null;
  ready: boolean;
  reason: string | null;
};

/** Return the default daemon control socket for CODEX_HOME. */
export function resolveCodexDaemonSocketPath(codexHome: string): string {
  return path.join(codexHome, 'app-server-control', 'app-server-control.sock');
}

/** Build a shared-connection plan without side effects from capabilities and socket state. */
export function resolveSharedCodexRuntimePlan(input: {
  codexHome: string;
  capabilities: CodexSharedRuntimeCapabilities;
  socketReady: boolean;
  socketPath?: string;
}): SharedCodexRuntimePlan {
  const supported = Object.values(input.capabilities).every(Boolean);
  if (!supported) {
    return {
      mode: 'unsupported', endpoint: null, socketPath: null,
      proxyArgs: null,
      ready: false, reason: 'codex-shared-runtime-capability-missing',
    };
  }
  const socketPath = input.socketPath || resolveCodexDaemonSocketPath(input.codexHome);
  return {
    mode: 'shared-daemon',
    endpoint: `unix://${socketPath}`,
    socketPath,
    proxyArgs: ['app-server', 'proxy', '--sock', socketPath],
    ready: input.socketReady,
    reason: input.socketReady ? null : 'user-managed-daemon-unavailable',
  };
}
