/**
 * Define runtime diagnostics, agent status, and model-list route boundaries.
 * Keep dependency and provider-authentication diagnostics separate from startup assembly.
 */

import { getCodexSharedRuntimeDiagnostics } from '../../domains/codex-app-server/shared-runtime-diagnostics.js';

/**
 * Register diagnostic HTTP routes.
 */
import type {
    AuthMiddleware,
    FsPromisesDeps,
    HttpRouteApp,
    OsDeps,
    PathDeps,
} from './route-deps.js';

export interface DiagnosticsRouteDeps {
    app: HttpRouteApp;
    authenticateToken: AuthMiddleware;
    buildRuntimeReadinessReport: () => Promise<unknown>;
    checkCodexCredentials: () => Promise<{ authenticated: boolean; email?: string }>;
    getCodexModelCatalog: () => Promise<{ defaultModel?: string; source?: string }>;
    getPiModelCatalog: () => Promise<{ models: unknown[] }>;
    resolveCodexCliPath: () => string;
    fsPromises: FsPromisesDeps;
    os: OsDeps;
    path: PathDeps;
}

export function registerDiagnosticsRoutes(deps: DiagnosticsRouteDeps): void {
    const { app, authenticateToken, buildRuntimeReadinessReport, checkCodexCredentials, getCodexModelCatalog, getPiModelCatalog, resolveCodexCliPath, fsPromises, os, path } = deps;

    app.get('/api/diagnostics/runtime-dependencies', authenticateToken, async (_req: any, res: any) => {
        const diagnostics = await buildRuntimeReadinessReport();
        res.json(diagnostics);
    });

    app.get('/api/diagnostics/codex-shared-runtime', authenticateToken, async (_req: any, res: any) => {
        /** Report client capabilities and socket connectivity without querying or managing daemon processes. */
        res.json(await getCodexSharedRuntimeDiagnostics());
    });

    app.get('/api/agents/status', authenticateToken, async (_req: any, res: any) => {
        const codexStatus: any = { authenticated: false, defaultModel: '', modelSource: '', apiKeySet: false, cliAvailable: false };
        const piStatus: any = { authenticated: false, defaultModel: '', defaultProvider: '', providers: [], cliAvailable: false };
        const codexAuth = await checkCodexCredentials();
        codexStatus.authenticated = codexAuth.authenticated;
        codexStatus.email = codexAuth.email || '';
        codexStatus.loginMethod = codexAuth.authenticated ? (codexAuth.email === 'API Key Auth' ? 'api_key' : 'oauth') : null;

        const codexApiKey = (process.env.OPENAI_API_KEY || '').trim();
        codexStatus.apiKeySet = Boolean(codexApiKey);
        if (!codexStatus.authenticated && codexStatus.apiKeySet) {
            codexStatus.authenticated = true;
            codexStatus.loginMethod = 'api_key';
            codexStatus.email = 'API Key Auth';
        }

        try {
            const codexCliPath = resolveCodexCliPath();
            codexStatus.cliAvailable = Boolean(codexCliPath) && codexCliPath !== 'codex';
        } catch {
            codexStatus.cliAvailable = false;
        }

        try {
            const catalog = await getCodexModelCatalog();
            if (catalog?.defaultModel) {
                codexStatus.defaultModel = catalog.defaultModel;
                codexStatus.modelSource = catalog.source || '';
            }
        } catch {
            // Model discovery failures are non-fatal for settings diagnostics.
        }

        try {
            const settings = JSON.parse(await fsPromises.readFile(path.join(os.homedir(), '.pi', 'agent', 'settings.json'), 'utf8'));
            piStatus.defaultModel = settings.defaultModel || '';
            piStatus.defaultProvider = settings.defaultProvider || '';
        } catch {
            // Missing Pi settings are reported as unauthenticated defaults.
        }

        try {
            const auth = JSON.parse(await fsPromises.readFile(path.join(os.homedir(), '.pi', 'agent', 'auth.json'), 'utf8'));
            piStatus.providers = Object.keys(auth).filter((key) => auth[key]?.type === 'api_key');
            piStatus.authenticated = piStatus.providers.length > 0;
        } catch {
            // Missing Pi auth is reported as unauthenticated.
        }
        piStatus.cliAvailable = piStatus.authenticated;
        res.json({ codex: codexStatus, pi: piStatus });
    });

    app.get('/api/pi/models', authenticateToken, async (_req: any, res: any) => {
        try {
            const catalog = await getPiModelCatalog();
            res.json({ success: true, models: catalog.models });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    });
}
