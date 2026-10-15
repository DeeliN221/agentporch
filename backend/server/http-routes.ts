#!/usr/bin/env node
/**
 * Preserve the HTTP service entry while delegating assembly to bootstrap.
 * Keep startup and historical imports stable without embedding business APIs or realtime delivery.
 */

import { startBackendServer as startServerBootstrap } from './server-bootstrap.js';

/**
 * Start the backend runtime.
 */
export async function startBackendServer() {
    await startServerBootstrap();
}
