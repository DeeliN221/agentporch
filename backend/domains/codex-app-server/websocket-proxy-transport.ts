/**
 * Use raw codex app-server proxy stdio for WebSocket handshake and message transport.
 * The proxy carries HTTP Upgrade and WebSocket frames, not JSONL.
 */

import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { Duplex } from 'node:stream';
import WebSocket from 'ws';
import type { CodexAppServerNotification, CodexAppServerTransport, JsonRpcLineTransportOptions } from './json-rpc-line-transport.js';

type PendingRequest = { resolve: (value: unknown) => void; reject: (reason: unknown) => void };

/** Adapt separate subprocess stdin/stdout streams into a duplex socket for ws. */
function createChildProxySocket(child: ChildProcessWithoutNullStreams): Duplex {
  const socket = new Duplex({
    read() {},
    write(chunk, _encoding, callback) { child.stdin.write(chunk, callback); },
    destroy(error, callback) {
      try { child.kill('SIGTERM'); } catch { /* The proxy may have already exited. */ }
      callback(error || null);
    },
  });
  child.stdout.on('data', (chunk) => socket.push(chunk));
  child.stdout.on('end', () => socket.push(null));
  child.on('error', (error) => socket.destroy(error));
  Object.assign(socket, {
    connecting: false,
    setTimeout: () => socket,
    setNoDelay: () => socket,
    setKeepAlive: () => socket,
    ref: () => socket,
    unref: () => socket,
  });
  setImmediate(() => socket.emit('connect'));
  return socket;
}

/** Create a WebSocket proxy transport and complete initialize/initialized handshaking. */
export function createWebSocketProxyTransport(
  child: ChildProcessWithoutNullStreams,
  options: JsonRpcLineTransportOptions = {},
): CodexAppServerTransport {
  const pendingRequests = new Map<string, PendingRequest>();
  const notificationHandlers: Array<(notification: CodexAppServerNotification) => void> = [];
  const socket = createChildProxySocket(child);
  const webSocket = new WebSocket('ws://localhost/rpc', {
    createConnection: () => socket as any,
    perMessageDeflate: false,
  });
  let initializedPromise: Promise<unknown> | null = null;

  child.stderr.on('data', (chunk) => console.error('[codex-app-server]', chunk.toString('utf8')));
  child.on('close', (code) => {
    const error = new Error(`Codex app-server proxy exited with code ${code}`);
    for (const pending of pendingRequests.values()) pending.reject(error);
    pendingRequests.clear();
    options.onFailure?.(error.message);
  });

  /** Wait for WebSocket Upgrade completion. */
  function waitForOpen(): Promise<void> {
    if (webSocket.readyState === WebSocket.OPEN) return Promise.resolve();
    return new Promise((resolve, reject) => {
      webSocket.once('open', resolve);
      webSocket.once('error', reject);
    });
  }

  /** Send JSON-RPC requests and correlate responses by ID. */
  async function sendRawRequest(method: string, params: unknown): Promise<unknown> {
    await waitForOpen();
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      pendingRequests.set(id, { resolve, reject });
      webSocket.send(JSON.stringify({ id, method, params }), (error) => {
        if (!error) return;
        pendingRequests.delete(id);
        reject(error);
      });
    });
  }

  /** Initialize each proxy connection and confirm the handshake with initialized. */
  function ensureInitialized(): Promise<unknown> {
    if (!initializedPromise) {
      initializedPromise = sendRawRequest('initialize', {
        clientInfo: { name: 'agentporch', title: 'AgentPorch', version: 'v2026.06.01' },
        capabilities: { experimentalApi: true, requestAttestation: false, optOutNotificationMethods: [] },
      }).then((result) => {
        webSocket.send(JSON.stringify({ method: 'initialized', params: {} }));
        return result;
      });
    }
    return initializedPromise;
  }

  webSocket.on('message', (data) => {
    let message: Record<string, unknown>;
    try { message = JSON.parse(data.toString()) as Record<string, unknown>; } catch (error) {
      console.error('[codex-app-server] invalid WebSocket JSON-RPC message', error);
      return;
    }
    const messageId = typeof message.id === 'string' || typeof message.id === 'number' ? String(message.id) : '';
    if (messageId && pendingRequests.has(messageId)) {
      const pending = pendingRequests.get(messageId)!;
      pendingRequests.delete(messageId);
      if (message.error) pending.reject(new Error(String((message.error as Record<string, unknown>)?.message || message.error)));
      else pending.resolve(message.result);
      return;
    }
    if (typeof message.method === 'string') {
      for (const handler of notificationHandlers) handler({ method: message.method, params: message.params });
    }
  });
  webSocket.on('error', (error) => options.onFailure?.(`Codex app-server WebSocket error: ${error.message}`));

  return {
    async request(method, params) {
      if (method !== 'initialize') await ensureInitialized();
      return sendRawRequest(method, params);
    },
    onNotification(handler) { notificationHandlers.push(handler); },
    close() {
      if (webSocket.readyState === WebSocket.OPEN) webSocket.close();
      else socket.destroy();
    },
  };
}
