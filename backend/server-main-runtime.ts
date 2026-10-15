#!/usr/bin/env node
/**
 * Provide a thin assembly entry for the legacy backend.
 * Load typed server modules without retaining routes or WebSocket behavior in the top-level entry.
 */
import { startBackendServer as startHttpRouteServer } from './server/http-routes.js';

/**
 * Start the backend service.
 */
export async function startBackendServer(): Promise<void> {
    await startHttpRouteServer();
}
