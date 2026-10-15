/**
 * Define the adapter from provider runtime writers to WebSocket events.
 * Attach stable session identity to Codex/Pi output to prevent delivery to another frontend session.
 */

/**
 * Wrap runtime writers with consistent session context.
 */
export function createRuntimeWriterAdapter(writer: any) {
    return {
        send(data: unknown) {
            writer.send(data);
        },
        setSessionId(sessionId: string) {
            writer.setSessionId?.(sessionId);
        },
        setSessionIndexContext(context: unknown) {
            writer.setSessionIndexContext?.(context);
        },
    };
}
