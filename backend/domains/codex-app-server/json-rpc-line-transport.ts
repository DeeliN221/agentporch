/**
 * Implement newline-framed Codex JSON-RPC over an arbitrary stdio subprocess.
 * Keep initialization, request correlation, and notification delivery independent of process launch method.
 */

import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import readline from 'node:readline';

export type CodexAppServerNotification = { method: string; params: unknown };
export type CodexAppServerTransport = {
  request(method: string, params: unknown): Promise<unknown>;
  onNotification(handler: (notification: CodexAppServerNotification) => void): void;
  close(): void;
};
export type JsonRpcLineTransportOptions = { onFailure?: (message: string) => void };
type PendingRequest = { resolve: (value: unknown) => void; reject: (reason: unknown) => void };

/** Parse one JSON-RPC line, logging and discarding malformed input. */
function parseJsonRpcLine(line: string): Record<string, unknown> | null {
  try {
    return JSON.parse(line) as Record<string, unknown>;
  } catch (err) {
    console.error('[codex-app-server] invalid JSON-RPC line', err);
    return null;
  }
}

/** Reject all pending requests on transport failure. */
function rejectPendingRequests(pendingRequests: Map<string, PendingRequest>, err: Error): void {
  for (const pending of pendingRequests.values()) pending.reject(err);
  pendingRequests.clear();
}

/** Create a JSON-RPC transport with an initialize handshake over a running stdio process. */
export function createJsonRpcLineTransport(
  child: ChildProcessWithoutNullStreams,
  options: JsonRpcLineTransportOptions = {},
): CodexAppServerTransport {
  const pendingRequests = new Map<string, PendingRequest>();
  const notificationHandlers: Array<(notification: CodexAppServerNotification) => void> = [];
  let initializedPromise: Promise<unknown> | null = null;
  const rl = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });

  rl.on('line', (line) => {
    if (!line.trim()) return;
    const message = parseJsonRpcLine(line);
    if (!message) return;
    if (typeof message.id === 'string' && pendingRequests.has(message.id)) {
      const pending = pendingRequests.get(message.id)!;
      pendingRequests.delete(message.id);
      if (message.error) pending.reject(new Error(String((message.error as Record<string, unknown>)?.message || message.error)));
      else pending.resolve(message.result);
      return;
    }
    if (typeof message.method === 'string') {
      for (const handler of notificationHandlers) {
        try {
          handler({ method: message.method, params: message.params });
        } catch (err) {
          console.error('[codex-app-server] notification handler failed', err);
        }
      }
    }
  });
  child.stderr.on('data', (chunk) => console.error('[codex-app-server]', chunk.toString('utf8')));
  child.on('error', (err) => {
    rejectPendingRequests(pendingRequests, err);
    options.onFailure?.(`Codex app-server process error: ${err.message}`);
  });
  child.on('close', (code) => {
    const err = new Error(`Codex app-server proxy exited with code ${code}`);
    rejectPendingRequests(pendingRequests, err);
    options.onFailure?.(err.message);
  });

  /** Send a low-level request with a unique ID. */
  function sendRawRequest(method: string, params: unknown): Promise<unknown> {
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      pendingRequests.set(id, { resolve, reject });
      try {
        child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
      } catch (writeErr) {
        pendingRequests.delete(id);
        reject(writeErr);
      }
    });
  }

  /** Initialize once before the first business request. */
  function ensureInitialized(): Promise<unknown> {
    if (!initializedPromise) {
      initializedPromise = sendRawRequest('initialize', {
        clientInfo: { name: 'agentporch', title: 'AgentPorch', version: 'v2026.06.01' },
        capabilities: { experimentalApi: true, requestAttestation: false, optOutNotificationMethods: [] },
      }).then((result) => {
        child.stdin.write(`${JSON.stringify({ method: 'initialized', params: {} })}\n`);
        return result;
      });
    }
    return initializedPromise;
  }

  return {
    async request(method, params) {
      if (method !== 'initialize') await ensureInitialized();
      return sendRawRequest(method, params);
    },
    onNotification(handler) { notificationHandlers.push(handler); },
    close() {
      try {
        child.kill('SIGTERM');
      } catch (err) {
        console.error('[codex-app-server] failed to terminate proxy process', err);
      }
      rl.close();
    },
  };
}
