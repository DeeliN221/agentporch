/**
 * PURPOSE: Keep file routes compatibility as a thin boundary.
 * Keep the historical entry while file-routes-runtime owns tree, download, and mutation behavior.
 */
export { registerFileRoutesImpl } from './file-routes-runtime.js';
export type { FileRouteDeps } from './file-routes-runtime.js';
