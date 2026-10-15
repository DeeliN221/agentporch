/**
 * Define WebSocket server creation, authentication, and path dispatch.
 * Chat and shell share an HTTP server while authentication and routing remain separate from startup.
 */
import { WebSocketServer } from 'ws';
import { getWebSocketAuthToken } from '../websocket-auth.js';
import { authenticateWebSocket } from '../middleware/auth.js';
import { handleChatConnection } from './chat-websocket.js';
import { handleShellConnection } from './shell-websocket.js';

type WebSocketAuthRequest = Parameters<typeof authenticateWebSocket>[1] & {
    headers?: Record<string, unknown>;
};

/**
 * Authenticate one WebSocket upgrade with the same bearer-token contract in every deployment mode.
 */
export function authenticateWebSocketUpgrade(req: WebSocketAuthRequest): { userId: number; username: string } | null {
    /** Reject missing or invalid tokens without a platform-mode identity fallback. */
    const token = getWebSocketAuthToken(req);
    return authenticateWebSocket(token || undefined, req);
}

/**
 * Create and attach the WebSocket gateway.
 */
export function createWebSocketGateway(deps: any): WebSocketServer {
    /**
     * PURPOSE: Keep authentication, server ownership, and URL dispatch in one
     * module so bootstrap only wires dependencies and lifecycle cleanup.
     */
    const { server, app, chatWebSocketDeps, shellWebSocketDeps } = deps;

    const wss = new WebSocketServer({
        server,
        perMessageDeflate: {
            threshold: 1024,
        },
        verifyClient: (info: any) => {
            console.log('WebSocket connection attempt to:', info.req.url);

            const user = authenticateWebSocketUpgrade(info.req);
            if (!user) {
                console.log('[WARN] WebSocket authentication failed');
                return false;
            }

            info.req.user = user;
            console.log('[OK] WebSocket authenticated for user:', user.username);
            return true;
        },
    });

    app.locals.wss = wss;

    wss.on('connection', (ws, request) => {
        const url = request.url;
        console.log('[INFO] Client connected to:', url);

        const urlObj = new URL(url || '/', 'http://localhost');
        const pathname = urlObj.pathname;

        if (pathname === '/shell') {
            handleShellConnection(shellWebSocketDeps, ws);
            return;
        }
        if (pathname === '/ws') {
            handleChatConnection(chatWebSocketDeps, ws, request);
            return;
        }

        console.log('[WARN] Unknown WebSocket path:', pathname);
        ws.close();
    });

    return wss;
}
