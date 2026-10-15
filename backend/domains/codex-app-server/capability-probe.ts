/**
 * Asynchronously probe and cache Codex client connectivity capabilities.
 * Support experimental command changes without blocking the event loop or duplicating concurrent help requests.
 */

import { execFile } from 'node:child_process';
import { buildPortableCodexSpawnEnv } from './stdio-transport.js';

const DEFAULT_CAPABILITY_CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_CAPABILITY_PROBE_TIMEOUT_MS = 5000;

export type CodexSharedRuntimeCapabilities = {
  proxy: boolean;
  unixSocket: boolean;
  remoteTui: boolean;
};

export type CodexCapabilityProbeOptions = {
  ttlMs?: number;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
};

type CapabilityCacheEntry = {
  capabilities: CodexSharedRuntimeCapabilities;
  expiresAt: number;
};

const successfulProbeCache = new Map<string, CapabilityCacheEntry>();
const pendingProbes = new Map<string, Promise<CodexSharedRuntimeCapabilities>>();
let cacheGeneration = 0;

/** Parse external-service connection capabilities from CLI help text. */
export function parseCodexSharedRuntimeCapabilities(input: {
  proxyHelp: string;
  rootHelp: string;
}): CodexSharedRuntimeCapabilities {
  return {
    proxy: /--sock\b/.test(input.proxyHelp) && /app-server proxy/i.test(input.proxyHelp),
    unixSocket: /Unix domain socket|unix:\/\//i.test(`${input.proxyHelp}\n${input.rootHelp}`),
    remoteTui: /--remote\b/.test(input.rootHelp) && /unix:\/\//i.test(input.rootHelp),
  };
}

/** Read CLI help asynchronously; reject failures so subsequent calls may retry. */
function readHelp(command: string, args: string[], options: CodexCapabilityProbeOptions): Promise<string> {
  /** Use asynchronous execFile callbacks without blocking the Node event loop. */
  return new Promise((resolve, reject) => {
    execFile(command, args, {
      encoding: 'utf8',
      env: buildPortableCodexSpawnEnv(options.env || process.env),
      timeout: options.timeoutMs ?? DEFAULT_CAPABILITY_PROBE_TIMEOUT_MS,
    }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`Codex capability probe failed: ${error.message}`));
        return;
      }
      resolve(`${stdout || ''}\n${stderr || ''}`);
    });
  });
}

/** Wait for both help subprocesses to settle before returning or failing the capability probe. */
async function runCapabilityProbe(
  command: string,
  options: CodexCapabilityProbeOptions,
): Promise<CodexSharedRuntimeCapabilities> {
  /** Use allSettled so one failed command does not leave another probe unresolved. */
  const [proxyHelp, rootHelp] = await Promise.allSettled([
    readHelp(command, ['app-server', 'proxy', '--help'], options),
    readHelp(command, ['--help'], options),
  ]);
  const failure = [proxyHelp, rootHelp].find((result) => result.status === 'rejected');
  if (failure?.status === 'rejected') throw failure.reason;
  return parseCodexSharedRuntimeCapabilities({
    proxyHelp: proxyHelp.status === 'fulfilled' ? proxyHelp.value : '',
    rootHelp: rootHelp.status === 'fulfilled' ? rootHelp.value : '',
  });
}

/**
 * Share one in-flight probe per Codex executable and cache only successful results.
 */
export function probeCodexSharedRuntimeCapabilities(
  command = 'codex',
  options: CodexCapabilityProbeOptions = {},
): Promise<CodexSharedRuntimeCapabilities> {
  /** Use executable paths as cache boundaries. */
  const now = Date.now();
  const cached = successfulProbeCache.get(command);
  if (cached && cached.expiresAt > now) return Promise.resolve(cached.capabilities);
  if (cached) successfulProbeCache.delete(command);

  const pending = pendingProbes.get(command);
  if (pending) return pending;

  const ttlMs = Math.max(0, options.ttlMs ?? DEFAULT_CAPABILITY_CACHE_TTL_MS);
  const probeGeneration = cacheGeneration;
  let probe!: Promise<CodexSharedRuntimeCapabilities>;
  probe = runCapabilityProbe(command, options)
    .then((capabilities) => {
      if (probeGeneration === cacheGeneration) {
        successfulProbeCache.set(command, { capabilities, expiresAt: Date.now() + ttlMs });
      }
      return capabilities;
    })
    .finally(() => {
      if (pendingProbes.get(command) === probe) pendingProbes.delete(command);
    });
  pendingProbes.set(command, probe);
  return probe;
}

/** Clear successful results and in-flight references for isolated cache tests. */
export function clearCodexCapabilityProbeCacheForTest(command?: string): void {
  /** Clearing does not kill running subprocesses; it prevents their results from contaminating later tests. */
  cacheGeneration += 1;
  if (command) {
    successfulProbeCache.delete(command);
    pendingProbes.delete(command);
    return;
  }
  successfulProbeCache.clear();
  pendingProbes.clear();
}
