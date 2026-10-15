/**
 * Define the system-update HTTP registration boundary.
 * Retain legacy routes but provide manual instructions only; never run package-management commands in the server.
 */

import type {
    AuthMiddleware,
    HttpRouteApp,
} from './route-deps.js';

export interface SystemRouteDeps {
    app: HttpRouteApp;
    authenticateToken: AuthMiddleware;
    installMode: string;
}

/**
 * Return the documented manual upgrade command for the detected install mode.
 */
export function getManualUpgradeCommand(installMode: string): string {
    return installMode === 'git'
        ? 'git pull --ff-only && pnpm install && pnpm run build'
        : 'npm update -g @deelin221/agentporch';
}

/**
 * Register the compatibility route without granting it process execution.
 */
export function registerSystemRoutes(deps: SystemRouteDeps): void {
    const { app, authenticateToken, installMode } = deps;

    app.post('/api/system/update', authenticateToken, (_req: any, res: any) => {
        const message = 'Automatic updates are disabled. Run the command manually, then restart agentporch.';
        res.status(409).json({
            success: false,
            manual: true,
            code: 'MANUAL_UPDATE_REQUIRED',
            command: getManualUpgradeCommand(installMode),
            message,
            error: message,
        });
    });
}
