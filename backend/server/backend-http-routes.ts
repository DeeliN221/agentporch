/**
 * Coordinate registration order for business HTTP route modules.
 * Distribute startup dependencies while route modules own their handlers and dependency contracts.
 */
import { registerFileRoutes } from './file-routes.js';
import { registerAttachmentRoutes } from './http/attachment-routes.js';
import { registerDiagnosticsRoutes } from './http/diagnostics-routes.js';
import { registerProjectRoutes } from './http/project-routes.js';
import { registerSessionRoutes } from './http/session-routes.js';
import { registerSessionAttentionRoutes } from './http/session-attention-routes.js';
import { registerSystemRoutes } from './http/system-routes.js';
import { registerUsageRoutes } from './http/usage-routes.js';
import { registerWorkflowRoutes } from './http/workflow-routes.js';
import type { FileRouteDeps } from './file-routes.js';
import type { AttachmentRouteDeps } from './http/attachment-routes.js';
import type { DiagnosticsRouteDeps } from './http/diagnostics-routes.js';
import type { ProjectRouteDeps } from './http/project-routes.js';
import type { SessionRouteDeps } from './http/session-routes.js';
import type { SessionAttentionRouteDeps } from './http/session-attention-routes.js';
import type { SystemRouteDeps } from './http/system-routes.js';
import type { UsageRouteDeps } from './http/usage-routes.js';
import type { WorkflowRouteDeps } from './http/workflow-routes.js';

export type BackendHttpRouteDeps = FileRouteDeps & Record<string, unknown>;

/**
 * Register business HTTP route modules.
 */
export function registerBackendHttpRoutes(deps: BackendHttpRouteDeps): void {
    const { app, authenticateToken } = deps;

    registerFileRoutes({
        app,
        authenticateToken,
        path: deps.path,
        fs: deps.fs,
        fsPromises: deps.fsPromises,
        WORKSPACES_ROOT: deps.WORKSPACES_ROOT,
        validateWorkspacePath: deps.validateWorkspacePath,
        resolveProjectRootWithHint: deps.resolveProjectRootWithHint,
        resolveReadableProjectPath: deps.resolveReadableProjectPath,
        resolveProjectPath: deps.resolveProjectPath,
        buildMutationResponse: deps.buildMutationResponse,
        joinProjectChildPath: deps.joinProjectChildPath,
        sanitizeEntryName: deps.sanitizeEntryName,
        sanitizeUploadRelativePath: deps.sanitizeUploadRelativePath,
        createDirectoryArchive: deps.createDirectoryArchive,
        sendDownload: deps.sendDownload,
        withLoggedFallback: deps.withLoggedFallback,
        classifyProjectFile: deps.classifyProjectFile,
        TEXT_SAMPLE_BYTES: deps.TEXT_SAMPLE_BYTES,
        mime: deps.mime,
    });

    registerSystemRoutes({ ...deps } as unknown as SystemRouteDeps);
    registerProjectRoutes({ ...deps } as unknown as ProjectRouteDeps);
    registerWorkflowRoutes({ ...deps } as unknown as WorkflowRouteDeps);
    registerSessionRoutes({ ...deps } as unknown as SessionRouteDeps);
    registerSessionAttentionRoutes({ ...deps } as unknown as SessionAttentionRouteDeps);
    registerAttachmentRoutes({ ...deps } as unknown as AttachmentRouteDeps);
    registerUsageRoutes({ ...deps } as unknown as UsageRouteDeps);
    registerDiagnosticsRoutes({ ...deps } as unknown as DiagnosticsRouteDeps);
}
