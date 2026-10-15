#!/usr/bin/env node
/**
 * Preserve the legacy backend filename while delegating implementation to runtime assembly.
 * Retain the startup entry without embedding HTTP, WebSocket, or watcher behavior here.
 */
import { startBackendServer as startRuntimeBackendServer } from './server-main-runtime.js';

/**
 * Start the backend service.
 */
export async function startServer(): Promise<void> {
    await startRuntimeBackendServer();
}

/**
 * Preserve the dynamic-import entry expected by backend/server-main.ts.
 */
export async function startBackendServer(): Promise<void> {
    await startServer();
}
