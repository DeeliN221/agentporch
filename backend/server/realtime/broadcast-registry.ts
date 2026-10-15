/**
 * Define the registry for public WebSocket broadcasts.
 * Expose auditable delivery interfaces for public refreshes, workflow changes, and session changes.
 */

type RuntimeClient = { readyState?: number; send(payload: string): void };
type LooseRecord = Record<string, any>;

/**
 * Create public broadcast helpers.
 */
export function createBroadcastRegistry(deps: any) {
    const { connectedClients, WebSocket, clearProjectDirectoryCache, isGetProjectsRunningRef } = deps;

    const sendToOpenClients = (payload: unknown) => {
        const message = JSON.stringify(payload);
        connectedClients.forEach((client: RuntimeClient) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(message);
            }
        });
    };

    return {
        broadcastProgress(progress: LooseRecord) {
            sendToOpenClients({ type: 'loading_progress', ...progress });
        },
        broadcastSessionChanged(payload: LooseRecord) {
            sendToOpenClients({ type: 'session_changed', ...payload, timestamp: new Date().toISOString() });
        },
        broadcastWorkflowChanged(payload: LooseRecord) {
            sendToOpenClients({ type: 'workflow_changed', ...payload, timestamp: new Date().toISOString() });
        },
        async broadcastProjectsUpdated(payload: LooseRecord = {}) {
            if (isGetProjectsRunningRef?.value) {
                return;
            }
            clearProjectDirectoryCache?.();
            sendToOpenClients({
                type: 'project_list_invalidated',
                reason: `manual-refresh:${payload.watchProvider || 'workflow'}:${payload.changeType || 'change'}`,
                changedFile: payload.changedFile || '',
                timestamp: new Date().toISOString(),
            });
        },
    };
}
