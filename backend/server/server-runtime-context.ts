/**
 * Define shared runtime state after splitting the legacy server.
 * Share connections, deduplication, broadcasts, and PTYs instead of creating duplicate state in split modules.
 */
import type { WebSocket } from 'ws';

export type CloseableWatcher = { close(): Promise<void> | void };

export type PtySessionRecord = {
    pty?: { kill?: () => void };
    timeoutId?: NodeJS.Timeout | null;
    ws?: WebSocket | null;
    buffer?: string[];
    projectPath?: string;
    sessionId?: string;
};

export type ServerRuntimeContext = {
    connectedClients: Set<WebSocket>;
    chatClientUsers: WeakMap<object, string | null>;
    recentChatRequestIds: Map<string, number>;
    pendingProjectListInvalidations: Map<string, NodeJS.Timeout>;
    ptySessionsMap: Map<string, PtySessionRecord>;
};

export type CreateServerRuntimeContextOptions = {
    connectedClients: Set<WebSocket>;
    chatClientUsers: WeakMap<object, string | null>;
    recentChatRequestIds: Map<string, number>;
    pendingProjectListInvalidations: Map<string, NodeJS.Timeout>;
    ptySessionsMap: Map<string, PtySessionRecord>;
};

/**
 * Bind the shared state container created by startup assembly.
 */
export function createServerRuntimeContext(options: CreateServerRuntimeContextOptions): ServerRuntimeContext {
    return {
        connectedClients: options.connectedClients,
        chatClientUsers: options.chatClientUsers,
        recentChatRequestIds: options.recentChatRequestIds,
        pendingProjectListInvalidations: options.pendingProjectListInvalidations,
        ptySessionsMap: options.ptySessionsMap,
    };
}
