/**
 * Define provider allowance and per-session token-usage APIs.
 * Declare each route module dependency explicitly so authorization boundaries remain visible.
 */

import type {
    AuthMiddleware,
    HttpRouteApp,
    OsDeps,
} from './route-deps.js';

export interface UsageRouteDeps {
    app: HttpRouteApp;
    authenticateToken: AuthMiddleware;
    normalizeManualProvider: (provider: unknown) => string;
    getUsageRemaining: (provider: string) => Promise<unknown>;
    os: OsDeps;
    getCodexSessionTokenUsage: (sessionId: string, options: { homeDir: string }) => Promise<unknown | null>;
}

/**
 * Register usage HTTP routes.
 */
export function registerUsageRoutes(deps: UsageRouteDeps): void {
    const { app, authenticateToken, normalizeManualProvider, getUsageRemaining, os, getCodexSessionTokenUsage } = deps;

// Get provider-level usage remaining metrics for UI status display.
const getUsageRemainingHandler = async (req: any, res: any) => {
    try {
        const provider = normalizeManualProvider(req.query.provider || 'codex');
        const usageRemaining = await getUsageRemaining(provider);
        res.json(usageRemaining);
    } catch (error: any) {
        console.error('Error reading usage remaining:', error);
        res.status(500).json({ error: 'Failed to read usage remaining' });
    }
};


// Get token usage for a specific session
const getSessionTokenUsageHandler = async (req: any, res: any) => {
    try {
        const { projectName, sessionId } = req.params;
        const { provider = 'codex' } = req.query;
        const homeDir = os.homedir();

        // Allow only safe characters in sessionId
        const safeSessionId = String(sessionId).replace(/[^a-zA-Z0-9._-]/g, '');
        if (!safeSessionId) {
            return res.status(400).json({ error: 'Invalid sessionId' });
        }

        const parsedContextWindow = parseInt(process.env.CONTEXT_WINDOW || '', 10);
        const contextWindow = Number.isFinite(parsedContextWindow) ? parsedContextWindow : 160000;

        if (provider === 'codex') {
            const tokenUsage = await getCodexSessionTokenUsage(safeSessionId, { homeDir });
            if (!tokenUsage) {
                return res.status(204).send();
            }
            return res.json(tokenUsage);
        }

        res.status(410).json({ error: 'Claude sessions are no longer supported' });
    } catch (error: any) {
        console.error('Error reading session token usage:', error);
        res.status(500).json({ error: 'Failed to read session token usage' });
    }
};


    app.get('/api/usage/remaining', authenticateToken, getUsageRemainingHandler);
    app.get('/api/projects/:projectName/sessions/:sessionId/token-usage', authenticateToken, getSessionTokenUsageHandler);
}
