/**
 * Use the actual proxy to verify ownership of the target thread and active turn.
 * Stale sockets and unrelated daemons must not bypass legacy-session warnings.
 */

import { spawn } from 'node:child_process';
import { createWebSocketProxyTransport } from './websocket-proxy-transport.js';
import { buildPortableCodexSpawnEnv } from './stdio-transport.js';

export type SharedThreadProbeResult = {
  ready: boolean;
  threadOwned: boolean;
  threadReadable: boolean;
  threadState: 'active' | 'idle' | 'unknown';
  activeTurnDetected: boolean;
  activeTurnOwned: boolean;
};

/** Normalize thread and turn status to stable strings. */
function readStatus(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  const type = (value as Record<string, unknown>).type;
  return typeof type === 'string' ? type : '';
}

/** Use only the thread and latest turn to determine activity; older unfinished history is not current activity. */
export function classifyCodexThreadActivity(thread: unknown): 'active' | 'idle' | 'unknown' {
  if (!thread || typeof thread !== 'object' || Array.isArray(thread)) return 'unknown';
  const record = thread as Record<string, unknown>;
  const activeStatuses = new Set(['active', 'inProgress', 'running']);
  if (activeStatuses.has(readStatus(record.status))) return 'active';
  if (!Array.isArray(record.turns) || record.turns.length === 0) return 'idle';
  /** Paginated threads omit turns when includeTurns=false; status.type still reports idle or active accurately. */
  if (Array.isArray(record.turns) && record.turns.length > 0) {
    const latestTurn = record.turns.at(-1);
    if (latestTurn && typeof latestTurn === 'object' && !Array.isArray(latestTurn)) {
      const latest = latestTurn as Record<string, unknown>;
      const latestStatus = readStatus(latest.status);
      if (activeStatuses.has(latestStatus)) return 'active';
      if (latestStatus === 'completed' || typeof latest.completedAt === 'number') return 'idle';
    }
  }
  /** Treat a non-active thread with no turn signal as idle, avoiding accidental empty-thread takeover. */
  const idleStatuses = new Set(['idle', 'completed', 'ready']);
  return idleStatuses.has(readStatus(record.status)) ? 'idle' : 'unknown';
}

/** Find the exact target thread ID in nested loaded/list responses. */
function containsThreadId(value: unknown, threadId: string): boolean {
  if (value === threadId) return true;
  if (Array.isArray(value)) return value.some((item) => containsThreadId(item, threadId));
  if (!value || typeof value !== 'object') return false;
  return Object.values(value as Record<string, unknown>).some((item) => containsThreadId(item, threadId));
}

/** Bound read-only probes so stale sockets cannot block shell initialization. */
function withTimeout<T>(promise: Promise<T>, timeoutMs = 5000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('shared thread probe timed out')), timeoutMs);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

/** Initialize and read the thread to establish ownership for safe takeover. */
export async function probeSharedCodexThread(socketPath: string, threadId: string): Promise<SharedThreadProbeResult> {
  const child = spawn('codex', ['app-server', 'proxy', '--sock', socketPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: buildPortableCodexSpawnEnv(),
  });
  const transport = createWebSocketProxyTransport(child);
  try {
    const loaded = await withTimeout(transport.request('thread/loaded/list', {}));
    const threadOwned = containsThreadId(loaded, threadId);
    try {
      /**
       * The daemon rejects includeTurns=true for new paginated threads.
       * （"paginated threads do not support thread/read(includeTurns=true)"），
       * Thread status.type already reports activity, so do not request turns by default.
       * Fall back to includeTurns=true only when metadata lacks status on legacy non-paginated threads.
       */
      let result = await withTimeout(transport.request('thread/read', { threadId, includeTurns: false }));
      const thread0 = (result as Record<string, unknown> | null)?.thread;
      const hasThreadStatus = thread0 && typeof thread0 === 'object'
        && 'status' in (thread0 as Record<string, unknown>);
      if (!hasThreadStatus) {
        result = await withTimeout(transport.request('thread/read', { threadId, includeTurns: true }));
      }
      const thread = (result as Record<string, unknown> | null)?.thread;
      const threadReadable = Boolean(
        thread
        && typeof thread === 'object'
        && String((thread as Record<string, unknown>).id || '') === threadId,
      );
      const threadState = threadReadable
        ? classifyCodexThreadActivity(thread)
        : 'unknown';
      const activeTurnDetected = threadState === 'active';
      return {
        ready: true,
        threadOwned,
        threadReadable,
        threadState,
        activeTurnDetected,
        activeTurnOwned: threadOwned && activeTurnDetected,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      /**
       * Mark a thread unreadable only when the actual read fails, such as missing or forbidden threads.
       * An includeTurns error must not invalidate metadata already read successfully.
       * Retry with includeTurns=false before classifying a paginated thread as blocked.
       */
      if (/includeTurns|paginated/i.test(message)) {
        try {
          const fallback = await withTimeout(transport.request('thread/read', { threadId, includeTurns: false }));
          const thread = (fallback as Record<string, unknown> | null)?.thread;
          const threadReadable = Boolean(
            thread
            && typeof thread === 'object'
            && String((thread as Record<string, unknown>).id || '') === threadId,
          );
          const threadState = threadReadable ? classifyCodexThreadActivity(thread) : 'unknown';
          return {
            ready: true,
            threadOwned,
            threadReadable,
            threadState,
            activeTurnDetected: threadState === 'active',
            activeTurnOwned: threadOwned && threadState === 'active',
          };
        } catch {
          // The thread is genuinely unreadable; use the unreadable branch below.
        }
      }
      return {
        ready: true,
        threadOwned,
        threadReadable: false,
        threadState: 'unknown',
        activeTurnDetected: false,
        activeTurnOwned: false,
      };
    }
  } catch {
    return {
      ready: false,
      threadOwned: false,
      threadReadable: false,
      threadState: 'unknown',
      activeTurnDetected: false,
      activeTurnOwned: false,
    };
  } finally {
    transport.close();
  }
}
