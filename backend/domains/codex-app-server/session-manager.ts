/**
 * Manage Codex app-server session state and transport recovery.
 * Centralize running-session failures, writer binding, and lookup for injected-transport regression tests.
 */

import { StreamingDeltaBatcher } from '../../streaming-delta-batcher.js';
import type { RuntimeWriter } from './types.js';

export type CodexAppServerSessionStatus = 'running' | 'completed' | 'aborted' | 'failed';

export type CodexAppServerSession = {
  agentporchSessionId: string;
  providerThreadId: string | null;
  activeTurnId: string | null;
  turnStartedAt?: string | null;
  status: CodexAppServerSessionStatus;
  projectPath: string;
  writer: RuntimeWriter | null;
  liveMessages: unknown[];
  notificationSubscribed: boolean;
  streamingDeltaBatcher?: StreamingDeltaBatcher;
};

export class CodexAppServerSessionManager {
  private readonly sessions = new Map<string, CodexAppServerSession>();

  /**
   * Get or create an app-server session for a AgentPorch session and project path.
   */
  getOrCreateSession(agentporchSessionId: string, projectPath: string, writer: RuntimeWriter | null): CodexAppServerSession {
    const id = this.getSessionId(agentporchSessionId, projectPath);
    let session = this.sessions.get(id);
    if (!session) {
      session = {
        agentporchSessionId,
        providerThreadId: null,
        activeTurnId: null,
        turnStartedAt: null,
        status: 'completed',
        projectPath,
        writer,
        liveMessages: [],
        notificationSubscribed: false,
      };
      this.sessions.set(id, session);
    }
    if (writer) session.writer = writer;
    return session;
  }

  /**
   * Read an existing session by AgentPorch identity and project path.
   */
  getSession(agentporchSessionId: string, projectPath: string): CodexAppServerSession | undefined {
    return this.sessions.get(this.getSessionId(agentporchSessionId, projectPath));
  }

  /**
   * Find sessions by provider thread ID to route app-server notifications correctly.
   */
  findSessionByThreadId(threadId: string): CodexAppServerSession | undefined {
    for (const session of this.sessions.values()) {
      if (session.providerThreadId === threadId) {
        return session;
      }
    }
    return undefined;
  }

  /**
   * Mark running sessions failed when the transport closes or errors.
   */
  markRunningSessionsFailed(errorMessage: string): void {
    for (const session of this.sessions.values()) {
      if (session.status !== 'running') continue;
      session.status = 'failed';
      session.activeTurnId = null;
      session.turnStartedAt = null;
      const sessionId = session.providerThreadId || session.agentporchSessionId;
      session.writer?.send({ type: 'codex-error', error: errorMessage, sessionId });
      session.writer?.send({
        type: 'session-status',
        sessionId,
        provider: 'codex',
        isProcessing: false,
      });
    }
  }

  /**
   * Preserve daemon turns after proxy loss; reset client subscriptions and report disconnection.
   */
  markTransportDisconnected(errorMessage: string): void {
    for (const session of this.sessions.values()) {
      session.notificationSubscribed = false;
      if (session.status !== 'running') continue;
      const sessionId = session.providerThreadId || session.agentporchSessionId;
      session.writer?.send({
        type: 'codex-connection-lost',
        error: errorMessage,
        sessionId,
        provider: 'codex',
        activeTurnPreserved: true,
      });
    }
  }

  /**
   * Clear test sessions and release streaming batchers.
   */
  clear(): void {
    for (const session of this.sessions.values()) {
      session.streamingDeltaBatcher?.dispose();
    }
    this.sessions.clear();
  }

  /**
   * Return Codex app-server sessions that remain active.
   */
  getActiveSessions(): Array<Record<string, unknown>> {
    const result: Array<Record<string, unknown>> = [];
    for (const session of this.sessions.values()) {
      if (session.status === 'running') {
        result.push({
          id: session.providerThreadId || session.agentporchSessionId,
          turnId: session.activeTurnId,
          status: session.status,
          startedAt: '',
          projectPath: session.projectPath,
          agentporchSessionId: session.agentporchSessionId,
          provider: 'codex',
        });
      }
    }
    return result;
  }

  /** Return session snapshots for notification resubscription after reconnect. */
  getSessions(): CodexAppServerSession[] {
    return [...this.sessions.values()];
  }

  /**
   * Build a session-map key.
   */
  private getSessionId(agentporchSessionId: string, projectPath: string): string {
    return `${agentporchSessionId}:${projectPath}`;
  }
}
