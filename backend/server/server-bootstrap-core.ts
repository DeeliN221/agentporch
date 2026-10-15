/**
 * PURPOSE: Keep backend bootstrap compatibility as a thin boundary.
 * Preserve the old assembly path while keeping the server runtime implementation separate.
 */
export { startBackendServer } from './server-runtime.js';
