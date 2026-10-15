/**
 * Load optional node-pty on demand, degrading terminal capability on failure.
 * HTTP, Web UI, and non-terminal features remain available when node-pty is absent.
 */
import { prepareNodePtyRuntime } from './node-pty-runtime.js';

export type NodePtyRuntime = {
    spawn: (...args: any[]) => any;
};

type NodePtyImporter = () => Promise<unknown>;
type NodePtyPreparer = () => void;

const TERMINAL_UNAVAILABLE_MESSAGE =
    'Web terminal unavailable: optional dependency node-pty could not be loaded. Reinstall AgentPorch without --omit=optional and restart it.';

/**
 * Represent unavailable Web-terminal capability without turning it into server startup failure.
 */
export class TerminalUnavailableError extends Error {
    readonly code = 'AGENTPORCH_TERMINAL_UNAVAILABLE';

    constructor(cause?: unknown) {
        super(TERMINAL_UNAVAILABLE_MESSAGE, { cause });
        this.name = 'TerminalUnavailableError';
    }
}

/**
 * Normalize the spawn interface from CommonJS or ESM node-pty exports.
 */
function normalizeNodePtyModule(moduleValue: unknown): NodePtyRuntime {
    const moduleRecord = moduleValue && typeof moduleValue === 'object'
        ? moduleValue as Record<string, unknown>
        : {};
    const defaultRecord = moduleRecord.default && typeof moduleRecord.default === 'object'
        ? moduleRecord.default as Record<string, unknown>
        : {};
    const candidate = typeof moduleRecord.spawn === 'function' ? moduleRecord : defaultRecord;
    if (typeof candidate.spawn !== 'function') {
        throw new Error('node-pty does not export spawn()');
    }
    return candidate as NodePtyRuntime;
}

/**
 * Create an injectable loader caching only successful loads to test native-module fallback.
 */
export function createNodePtyLoader(options: {
    importModule?: NodePtyImporter;
    prepareRuntime?: NodePtyPreparer;
} = {}): () => Promise<NodePtyRuntime> {
    const importModule = options.importModule ?? (() => import('node-pty'));
    const prepareRuntime = options.prepareRuntime ?? prepareNodePtyRuntime;
    let cachedRuntime: NodePtyRuntime | null = null;
    let pendingLoad: Promise<NodePtyRuntime> | null = null;

    return async function loadNodePtyRuntime(): Promise<NodePtyRuntime> {
        /** Return a prepared runtime without repeating native-module work. */
        if (cachedRuntime) {
            return cachedRuntime;
        }
        if (!pendingLoad) {
            pendingLoad = importModule()
                .then((moduleValue) => {
                    const runtime = normalizeNodePtyModule(moduleValue);
                    prepareRuntime();
                    cachedRuntime = runtime;
                    return runtime;
                })
                .catch((error) => {
                    throw error instanceof TerminalUnavailableError
                        ? error
                        : new TerminalUnavailableError(error);
                })
                .finally(() => {
                    pendingLoad = null;
                });
        }
        return pendingLoad;
    };
}

export const loadNodePtyRuntime = createNodePtyLoader();
