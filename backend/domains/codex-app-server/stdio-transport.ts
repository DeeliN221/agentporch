/**
 * Connect a stdio proxy to the system Codex daemon and pass it to the generic JSON-RPC transport.
 * AgentPorch owns only the client proxy, leaving service lifecycle and configuration unchanged.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { sanitizeChildProcessEnv } from '../../security/child-process-env.js';
import { probeCodexSharedRuntimeCapabilities } from './capability-probe.js';
import {
  type CodexAppServerTransport,
  type JsonRpcLineTransportOptions,
} from './json-rpc-line-transport.js';
import { resolveSharedCodexRuntimePlan } from './shared-runtime-plan.js';
import { createWebSocketProxyTransport } from './websocket-proxy-transport.js';

export type { CodexAppServerNotification, CodexAppServerTransport } from './json-rpc-line-transport.js';
export type StdioTransportOptions = JsonRpcLineTransportOptions;

type ProductionTransportLaunch = {
  args: string[];
  env: NodeJS.ProcessEnv;
};

/** Return the default daemon control socket path. */
function getCodexDaemonSocketPath(): string {
  const codexHome = process.env.CODEX_HOME || path.join(homedir(), '.codex');
  return path.join(codexHome, 'app-server-control', 'app-server-control.sock');
}

/** Build stdio proxy arguments for connecting to the independent daemon. */
export function buildCodexAppServerCliArgs(socketPath = getCodexDaemonSocketPath()): string[] {
  return ['app-server', 'proxy', '--sock', socketPath];
}

/**
 * Merge common user binary directories into the spawned environment PATH.
 * systemd user services may omit pnpm/bin, causing spawn('codex') to fail with ENOENT,
 * which would keep shared-thread probes unready and hide takeover controls.
 */
const PORTABLE_BIN_SEGMENTS = [
  '.local/share/pnpm/bin',
  '.local/share/pnpm',
  '.local/bin',
  '.bun/bin',
  '.cargo/bin',
  'bin',
];

/** Resolve user binary directories while preserving existing PATH entries. */
export function resolvePortableCodexPath(baseEnv: NodeJS.ProcessEnv = process.env): string {
  const home = typeof baseEnv.HOME === 'string' && baseEnv.HOME ? baseEnv.HOME : homedir();
  const inheritedPath = typeof baseEnv.PATH === 'string' && baseEnv.PATH ? baseEnv.PATH : '';
  const merged = PORTABLE_BIN_SEGMENTS.map((segment) => path.join(home, segment));
  for (const segment of inheritedPath.split(':')) {
    const trimmed = segment.trim();
    if (trimmed && !merged.includes(trimmed)) {
      merged.push(trimmed);
    }
  }
  return merged.join(':');
}

/** Remove private AgentPorch configuration and add portable PATH entries for spawn/execFile. */
export function buildPortableCodexSpawnEnv(baseEnv: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return { ...sanitizeChildProcessEnv(baseEnv), PATH: resolvePortableCodexPath(baseEnv) };
}

/** Asynchronously validate client capability and socket availability before returning proxy arguments. */
async function prepareProductionTransport(): Promise<ProductionTransportLaunch> {
  const codexHome = process.env.CODEX_HOME || path.join(homedir(), '.codex');
  const socketPath = getCodexDaemonSocketPath();
  const plan = resolveSharedCodexRuntimePlan({
    codexHome,
    capabilities: await probeCodexSharedRuntimeCapabilities(),
    socketReady: existsSync(socketPath),
    socketPath,
  });
  if (plan.mode === 'unsupported') {
    throw new Error('This Codex CLI lacks proxy, Unix socket, or remote TUI support. Upgrade the Codex client.');
  }

  if (!plan.ready) {
    throw new Error(`Cannot connect to the Codex service (${plan.socketPath}). Check the external daemon.`);
  }
  return {
    args: plan.proxyArgs || buildCodexAppServerCliArgs(socketPath),
    env: buildPortableCodexSpawnEnv(),
  };
}

/** Start a proxy transport connected to the shared daemon. */
function spawnSharedProxy(launch: ProductionTransportLaunch, options: JsonRpcLineTransportOptions): CodexAppServerTransport {
  const child = spawn('codex', launch.args, { stdio: ['pipe', 'pipe', 'pipe'], env: buildPortableCodexSpawnEnv(launch.env) });
  return createWebSocketProxyTransport(child, options);
}

/** Create the production transport; closing it terminates only the proxy, never the daemon. */
export function createStdioAppServerTransport(options: StdioTransportOptions = {}): CodexAppServerTransport {
  const notificationHandlers: Array<(notification: Parameters<Parameters<CodexAppServerTransport['onNotification']>[0]>[0]) => void> = [];
  let transportPromise: Promise<CodexAppServerTransport> | null = null;
  let liveTransport: CodexAppServerTransport | null = null;
  let closed = false;
  /** Probe and connect lazily on the first request; concurrent requests share one promise. */
  const getTransport = () => {
    if (!transportPromise) {
      const attempt = prepareProductionTransport().then((launch) => {
        if (closed) throw new Error('Codex app-server transport already closed');
        const transport = spawnSharedProxy(launch, options);
        for (const handler of notificationHandlers) transport.onNotification(handler);
        liveTransport = transport;
        return transport;
      });
      transportPromise = attempt;
      void attempt.catch(() => {
        /** Do not cache probe or preparation failures so a later request can retry. */
        if (transportPromise === attempt) transportPromise = null;
      });
    }
    return transportPromise;
  };
  return {
    async request(method, params) {
      return (await getTransport()).request(method, params);
    },
    onNotification(handler) {
      notificationHandlers.push(handler);
      liveTransport?.onNotification(handler);
    },
    close() {
      closed = true;
      void transportPromise?.then((transport) => transport.close(), () => undefined);
    },
  };
}
