/**
 * Assemble project file read/write, upload, download, and browsing APIs.
 * Move file API implementation into focused modules while retaining this registration entry.
 */
export { permissionBitsToRwx, expandWorkspacePath } from './files/file-route-helpers.js';
import type { FileRouteDeps as FileRouteDepsImpl } from './files/file-routes-impl.js';
import { registerFileRoutesImpl } from './files/file-routes-impl.js';
import { registerFileTreeRoutes } from './files/file-tree-routes.js';
import { registerFileMutationRoutes } from './files/file-mutation-routes.js';
import { registerFileDownloadRoutes } from './files/file-download-routes.js';

export interface FileRouteDeps extends FileRouteDepsImpl {}

export function registerFileRoutes(deps: FileRouteDeps): void {
  /** Compose tree, mutation, and download modules and invoke the file API registrar. */
  registerFileTreeRoutes(deps);
  registerFileMutationRoutes(deps);
  registerFileDownloadRoutes(deps);
  registerFileRoutesImpl(deps);
}
