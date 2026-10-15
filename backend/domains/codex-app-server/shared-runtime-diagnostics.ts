/**
 * Summarize client capabilities and socket state required to connect to the system Codex daemon.
 * Report connectivity without reading, configuring, or managing daemon process/network state.
 */

import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import {
  probeCodexSharedRuntimeCapabilities,
  type CodexSharedRuntimeCapabilities,
} from './capability-probe.js';
import { resolveSharedCodexRuntimePlan } from './shared-runtime-plan.js';

/** Build a connectivity snapshot asynchronously without blocking or invoking daemon management commands. */
export async function getCodexSharedRuntimeDiagnostics(): Promise<Record<string, unknown>> {
  const codexHome = process.env.CODEX_HOME || path.join(homedir(), '.codex');
  const socketPath = path.join(codexHome, 'app-server-control', 'app-server-control.sock');
  let capabilities: CodexSharedRuntimeCapabilities;
  try {
    capabilities = await probeCodexSharedRuntimeCapabilities();
  } catch (error) {
    /** Do not cache probe failures; return a readable diagnostic and allow a later retry. */
    return {
      mode: 'unsupported',
      ready: false,
      endpoint: null,
      socketPath,
      capabilities: { proxy: false, unixSocket: false, remoteTui: false },
      reason: 'codex-client-capability-probe-failed',
      error: error instanceof Error ? error.message : String(error),
    };
  }
  const plan = resolveSharedCodexRuntimePlan({ codexHome, capabilities, socketReady: existsSync(socketPath), socketPath });
  return {
    mode: plan.mode,
    ready: plan.ready,
    endpoint: plan.endpoint,
    socketPath,
    capabilities,
    reason: plan.reason,
  };
}
