import { sendClaudeMessage, abortClaudeSession, getClaudeSessionStatus, getActiveClaudeSessions } from '../../domains/provider-runtime/claude-cli-runtime.js';
/**
 * Define chat WebSocket connection handling.
 * Keep chat protocol and provider runtime interactions separate from HTTP assembly.
 */
import type { WebSocket } from 'ws';
import {
    readProviderSessionBinding,
    writeProviderSessionBinding,
} from '../../domains/provider-runtime/provider-session-binding.js';
import { createRuntimeWriterAdapter as defaultCreateRuntimeWriterAdapter } from './runtime-writer-adapter.js';
import type { ChatInboundMessage } from './chat-message-schema.js';
import { appendAttachmentNote } from '../../chat-attachments.js';
import {
    createChatClientScopeStore,
    normalizeChatClientScope,
    type ChatClientScope,
} from './chat-client-scope-store.js';
import { dispatchChatCommand as routeChatCommand } from './chat-command-router.js';

type LooseRecord = Record<string, any>;

const chatClientScopes = createChatClientScopeStore();

/**
 * Build the exact text sent to providers so native runtime paths receive the
 * same uploaded-file instructions as legacy direct provider calls.
 */
function buildProviderPromptText(command: string, attachments: unknown): string {
    const uploadedAttachments = Array.isArray(attachments)
        ? attachments as Record<string, unknown>[]
        : [];
    return appendAttachmentNote(command || '', uploadedAttachments);
}

/**
 * Record the sessions owned or subscribed to by a browser window.
 */
function rememberChatClientScope(ws: WebSocket, scope: LooseRecord, userId: string | null): void {
    /**
     * PURPOSE: Associate private provider events with the browser window that
     * started or explicitly subscribed to the session.
     */
    const normalized = normalizeChatClientScope(scope, userId);
    if (!normalized) {
        return;
    }

    const existingScopes = chatClientScopes.get(ws);
    const nextScopes = existingScopes.filter((existing) => {
        if (normalized.agentporchSessionId && existing.agentporchSessionId === normalized.agentporchSessionId) {
            return false;
        }
        if (normalized.providerSessionId && existing.providerSessionId === normalized.providerSessionId) {
            return false;
        }
        if (normalized.clientRequestId && existing.clientRequestId === normalized.clientRequestId) {
            return false;
        }
        return true;
    });
    nextScopes.push(normalized);
    chatClientScopes.set(ws, nextScopes);
}

/**
 * Check explicit ownership or subscription before delivering a private realtime event.
 */
function chatClientScopeMatches(eventScope: ChatClientScope, targetScope: ChatClientScope): boolean {
    /**
     * PURPOSE: Match by stable session identity first, with request id as a
     * fallback for events emitted before the provider session is finalized.
     */
    if (eventScope.userId !== null && targetScope.userId !== eventScope.userId) {
        return false;
    }
    if (eventScope.projectPath && targetScope.projectPath && targetScope.projectPath !== eventScope.projectPath) {
        return false;
    }
    if (eventScope.provider && targetScope.provider && targetScope.provider !== eventScope.provider) {
        return false;
    }
    if (eventScope.agentporchSessionId && targetScope.agentporchSessionId === eventScope.agentporchSessionId) {
        return true;
    }
    if (eventScope.providerSessionId && targetScope.providerSessionId === eventScope.providerSessionId) {
        return true;
    }
    return Boolean(eventScope.clientRequestId && targetScope.clientRequestId === eventScope.clientRequestId);
}

/**
 * Record the user associated with a chat WebSocket client.
 */
export function registerChatClient(runtime: any, ws: WebSocket, userId: string | null): void {
    runtime.connectedClients.add(ws);
    runtime.chatClientUsers.set(ws, userId);
    chatClientScopes.set(ws, []);
}

/**
 * Remove chat WebSocket client state.
 */
export function unregisterChatClient(runtime: any, ws: WebSocket): void {
    runtime.connectedClients.delete(ws);
    runtime.chatClientUsers.delete(ws);
    chatClientScopes.clear(ws);
}

/**
 * Create the chat protocol command dispatcher.
 */
export function createChatCommandDispatcher(deps: any, ws: WebSocket, request: any) {
    const { connectedClients, chatClientUsers, broadcastChatEvent, finalizeManualSessionRoute, initManualSessionRoute, updateManualSessionTitleFromFirstRequest, acceptChatRequestId, resolveChatProjectOptions, extractProjectDirectory, resolveAgentPorchSessionStartContext, resolveAgentPorchRouteSessionIdFromProviderSession, getSessionModelState, sendNativeMessage, sendMessageAccepted, abortNativeSession, broadcastSessionModelStateUpdated, isAgentPorchRouteSessionId, normalizeManualProvider, getNativeSessionStatus, getActiveNativeSessions, createRuntimeWriterAdapter, sessionSubscriptionRegistry, broadcastProjectListInvalidated } = deps;
    const adaptRuntimeWriter = typeof createRuntimeWriterAdapter === 'function'
        ? createRuntimeWriterAdapter
        : defaultCreateRuntimeWriterAdapter;
    /**
     * WebSocket Writer - Wrapper for WebSocket to match SSEStreamWriter interface
     */
    class WebSocketWriter {
        ws: WebSocket;
        sendFn?: (data: unknown, sessionId: string | null, sessionIndexContext: LooseRecord | null) => void;
        sessionId: string | null;
        sessionIndexContext: LooseRecord | null;
        isWebSocketWriter: boolean;

        constructor(ws: WebSocket, sendFn?: (data: unknown, sessionId: string | null, sessionIndexContext: LooseRecord | null) => void) {
            this.ws = ws;
            this.sendFn = sendFn;
            this.sessionId = null;
            this.sessionIndexContext = null;
            this.isWebSocketWriter = true;  // Marker for transport detection
        }

        send(data: unknown) {
            this.sendWithContext(data, this.sessionId, this.sessionIndexContext);
        }

        sendWithContext(data: unknown, sessionId: string | null, sessionIndexContext: LooseRecord | null) {
            /**
             * PURPOSE: Send one WebSocket payload with the route context owned by the
             * runtime session that emitted it. This prevents concurrent sessions on
             * one browser socket from overwriting each other's cN route identity.
             */
            if (typeof this.sendFn === 'function') {
                this.sendFn(data, sessionId, sessionIndexContext);
                return;
            }

            if (this.ws.readyState === 1) { // WebSocket.OPEN
                // Providers send raw objects, we stringify for WebSocket
                this.ws.send(JSON.stringify(data));
            }
        }

        setSessionId(sessionId: string) {
            this.sessionId = sessionId;
        }

        getSessionId() {
            return this.sessionId;
        }

        setSessionIndexContext(context: LooseRecord | null) {
            /**
             * Attach the agentporch route id used to mirror provider events into the index.
             */
            this.sessionIndexContext = context;
        }

        getSessionIndexContext() {
            /**
             * Return the active agentporch index context for fire-and-forget event writes.
             */
            return this.sessionIndexContext;
        }

        withSessionIndexContext(context: LooseRecord) {
            /**
             * PURPOSE: Create a writer bound to one manual cN route for the lifetime
             * of a provider runtime session.
             */
            return new ScopedWebSocketWriter(this, context);
        }
    }

    class ScopedWebSocketWriter {
        parentWriter: WebSocketWriter;
        sessionIndexContext: LooseRecord | null;
        sessionId: string | null;
        isWebSocketWriter: boolean;

        constructor(parentWriter: WebSocketWriter, sessionIndexContext: LooseRecord | null) {
            this.parentWriter = parentWriter;
            this.sessionIndexContext = sessionIndexContext;
            this.sessionId = null;
            this.isWebSocketWriter = true;
        }

        send(data: unknown) {
            this.parentWriter.sendWithContext(data, this.sessionId, this.sessionIndexContext);
        }

        setSessionId(sessionId: string) {
            this.sessionId = sessionId;
        }

        getSessionId() {
            return this.sessionId;
        }

        setSessionIndexContext(context: LooseRecord | null) {
            this.sessionIndexContext = context;
        }

        getSessionIndexContext() {
            return this.sessionIndexContext;
        }
    }

    async function finalizeAgentPorchRouteSession({
        projectName,
        projectPath,
        provider,
        agentporchSessionId,
        routeInitToken,
        providerSessionId,
    }: LooseRecord) {
        /**
         * Promote a route-only manual session (cN) to the provider session id.
         */
        if (!agentporchSessionId || !providerSessionId) {
            return;
        }
        if (providerSessionId === agentporchSessionId) {
            return false;
        }

        await writeProviderSessionBinding({
            projectName: projectName || '',
            projectPath: projectPath || '',
            routeSessionId: agentporchSessionId,
            provider: provider === 'pi' ? 'pi' : provider === 'claude' ? 'claude' : 'codex',
            providerSessionId,
        });

        let finalized = false;
        try {
            finalized = await finalizeManualSessionRoute(
                projectName || '',
                agentporchSessionId,
                providerSessionId,
                provider,
                projectPath || '',
            );
        } catch (error: any) {
            console.warn('[ManualSession] Failed to finalize manual session draft:', error.message);
        }

        if (finalized && typeof broadcastProjectListInvalidated === 'function') {
            await broadcastProjectListInvalidated({
                reason: 'manual-session-provider-bound',
                changedProjectPath: projectPath || '',
            });
        }

        return finalized;
    }

    async function updateManualRouteTitleFromCommand({
        projectName,
        projectPath,
        provider,
        agentporchSessionId,
        command,
    }: LooseRecord) {
        /**
         * Persist the first real user request as the visible manual cN title
         * when the route still uses its generated session-number placeholder.
         */
        if (!agentporchSessionId || !String(command || '').trim() || typeof updateManualSessionTitleFromFirstRequest !== 'function') {
            return;
        }
        try {
            const result = await updateManualSessionTitleFromFirstRequest(
                projectName || '',
                projectPath || '',
                agentporchSessionId,
                provider === 'pi' ? 'pi' : provider === 'claude' ? 'claude' : 'codex',
                command,
            );
            if (result?.updated && typeof broadcastProjectListInvalidated === 'function') {
                await broadcastProjectListInvalidated({
                    reason: 'manual-session-first-request-title',
                    changedProjectPath: projectPath || '',
                });
            }
        } catch (error: any) {
            console.warn('[ManualSession] Failed to update first request title:', error.message);
        }
    }

    function resolveLifecycleProviderSessionId(payload: LooseRecord, agentporchSessionId: string) {
        /**
         * PURPOSE: Extract the durable provider transcript id from lifecycle
         * events without ever treating the WebUI cN route as a native session id.
         */
        if (!payload || typeof payload !== 'object' || !agentporchSessionId) {
            return '';
        }

        const eventType = payload.type;
        const candidate = eventType === 'session-created'
            ? payload.sessionId
            : eventType === 'codex-complete' || eventType === 'pi-complete' || eventType === 'claude-complete'
                ? payload.actualSessionId || payload.sessionId
                : '';
        if (
            typeof candidate !== 'string'
            || !candidate.trim()
            || candidate === agentporchSessionId
            || isAgentPorchRouteSessionId(candidate)
            || /^codex-\d+$/.test(candidate.trim())
            || /^pi-\d+$/.test(candidate.trim())
        ) {
            return '';
        }
        return candidate.trim();
    }

    // Handle chat WebSocket connections
    function runChatConnection(ws: WebSocket, request: any) {
        console.log('[INFO] Chat WebSocket connected');

        // Add to connected clients for project updates
        registerChatClient({ connectedClients, chatClientUsers }, ws, request?.user?.id || null);

        const sendToChatClients = (payload: unknown, payloadSessionId?: string | null, payloadIndexContext?: LooseRecord | null) => {
            const sourceUserId = chatClientUsers.get(ws) || null;
            const indexContext = payloadIndexContext || writer.getSessionIndexContext();
            const payloadRecord = (payload && typeof payload === 'object') ? payload as LooseRecord : {};
            const indexedPayload = indexContext?.agentporchSessionId
                ? {
                    ...payloadRecord,
                    projectName: indexContext.projectName || payloadRecord.projectName,
                    projectPath: indexContext.projectPath || payloadRecord.projectPath,
                    provider: indexContext.provider || payloadRecord.provider,
                    agentporchSessionId: indexContext.agentporchSessionId,
                    agentporch_session_id: indexContext.agentporchSessionId,
                }
                : payloadRecord;
            const privateScope = normalizeChatClientScope({
                ...indexedPayload,
                agentporchSessionId: indexedPayload.agentporchSessionId || indexedPayload.agentporch_session_id || indexContext?.agentporchSessionId || payloadSessionId,
                providerSessionId: indexedPayload.providerSessionId || indexedPayload.provider_session_id || indexedPayload.sessionId,
                clientRequestId: indexedPayload.clientRequestId || indexedPayload.client_request_id || indexContext?.routeInitToken,
            }, sourceUserId);
            const lifecycleProviderSessionId = resolveLifecycleProviderSessionId(payloadRecord, indexContext?.agentporchSessionId || '');
            if (indexContext?.agentporchSessionId && lifecycleProviderSessionId) {
                void (async () => {
                    await writeProviderSessionBinding({
                        projectName: indexContext.projectName || '',
                        projectPath: indexContext.projectPath || '',
                        routeSessionId: indexContext.agentporchSessionId,
                        provider: indexContext.provider === 'pi' ? 'pi' : indexContext.provider === 'claude' ? 'claude' : 'codex',
                        providerSessionId: lifecycleProviderSessionId,
                    });
                    const runtime = await readProviderSessionBinding(
                        indexContext.projectName || '',
                        indexContext.projectPath || '',
                        indexContext.agentporchSessionId,
                    );
                    const runtimeProvider = runtime?.provider || payloadRecord.provider || indexContext.provider || 'codex';
                    await finalizeAgentPorchRouteSession({
                        projectName: indexContext.projectName || '',
                        projectPath: indexContext.projectPath || '',
                        provider: runtimeProvider,
                        agentporchSessionId: indexContext.agentporchSessionId,
                        routeInitToken: indexContext.routeInitToken || '',
                        providerSessionId: lifecycleProviderSessionId,
                    });
                })().catch((error) => {
                    console.warn('[ManualSession] Failed to store pending provider session:', error.message);
                });
            }
            if (!privateScope) {
                broadcastChatEvent(indexedPayload, sourceUserId);
                return;
            }

            const serializedPayload = JSON.stringify(indexedPayload);
            connectedClients.forEach((client: WebSocket) => {
                if (client.readyState !== 1) {
                    return;
                }
                if (client === ws) {
                    client.send(serializedPayload);
                    return;
                }

                const targetScopes = chatClientScopes.get(client);
                if (
                    sessionSubscriptionRegistry?.clientMatchesSession(client, privateScope)
                    || targetScopes.some((targetScope) => chatClientScopeMatches(privateScope, targetScope))
                ) {
                    client.send(serializedPayload);
                }
            });
        };

        // Wrap WebSocket with writer for consistent interface with SSEStreamWriter
        const writer = new WebSocketWriter(ws, sendToChatClients);

        async function handleChatCommand(data: ChatInboundMessage): Promise<void> {
            /**
             * PURPOSE: Keep command branching and provider runtime calls outside the
             * WebSocket lifecycle handler while preserving the legacy command behavior.
             */
                console.log('📨 Chat message received:', data.type);
                if (data.type === 'codex-command') {
                    if (!acceptChatRequestId(data.clientRequestId || data.options?.clientRequestId)) {
                        console.warn('[DEBUG] Ignoring duplicate Codex request:', data.clientRequestId || data.options?.clientRequestId);
                        return;
                    }
                    const resolvedOptions = await resolveChatProjectOptions(data.options, extractProjectDirectory) as LooseRecord;
                    let {
                        agentporchSessionId,
                        routeInitToken,
                    } = resolveAgentPorchSessionStartContext(data, resolvedOptions);
                    if (!agentporchSessionId) {
                        agentporchSessionId = await resolveAgentPorchRouteSessionIdFromProviderSession('codex', data, resolvedOptions);
                    }
                    const codexManualRuntime = agentporchSessionId
                        ? await readProviderSessionBinding(
                            resolvedOptions?.projectName || data.options?.projectName || '',
                            resolvedOptions?.projectPath || resolvedOptions?.cwd || '',
                            agentporchSessionId,
                        )
                        : null;
                    const shouldStartAgentPorchDraft = agentporchSessionId && (
                        !codexManualRuntime?.providerSessionId
                        &&
                        (!resolvedOptions?.sessionId || isAgentPorchRouteSessionId(resolvedOptions.sessionId))
                        && (!data.sessionId || isAgentPorchRouteSessionId(data.sessionId))
                    );
                    const codexProviderOptions = shouldStartAgentPorchDraft
                        ? { ...resolvedOptions, sessionId: undefined, resume: false }
                        : resolvedOptions;
                    const codexSessionIndexContext = agentporchSessionId ? {
                        projectName: codexProviderOptions?.projectName || data.options?.projectName || '',
                        projectPath: codexProviderOptions?.projectPath || codexProviderOptions?.cwd || '',
                        provider: 'codex',
                        agentporchSessionId,
                        routeInitToken,
                    } : null;
                    if (codexSessionIndexContext) {
                        rememberChatClientScope(ws, {
                            ...codexSessionIndexContext,
                            clientRequestId: routeInitToken || data.clientRequestId || data.options?.clientRequestId || '',
                            providerSessionId: codexManualRuntime?.providerSessionId || '',
                        }, chatClientUsers.get(ws) || null);
                    }
                    const codexRuntimeWriter = adaptRuntimeWriter(codexSessionIndexContext
                        ? writer.withSessionIndexContext(codexSessionIndexContext)
                        : writer);
                    if (shouldStartAgentPorchDraft) {
                        const startResult = await initManualSessionRoute(
                            codexProviderOptions?.projectName || data.options?.projectName || '',
                            codexProviderOptions?.projectPath || codexProviderOptions?.cwd || '',
                            agentporchSessionId,
                            'codex',
                        );
                        if (!startResult.started && startResult.reason !== 'already-started') {
                            writer.send({
                                type: 'session-start-rejected',
                                sessionId: agentporchSessionId,
                                agentporchSessionId,
                                provider: 'codex',
                                reason: startResult.reason,
                            });
                            return;
                        }
                        await updateManualRouteTitleFromCommand({
                            projectName: codexProviderOptions?.projectName || data.options?.projectName || '',
                            projectPath: codexProviderOptions?.projectPath || codexProviderOptions?.cwd || '',
                            provider: 'codex',
                            agentporchSessionId,
                            command: data.command || '',
                        });
                    }
                    console.log('[DEBUG] Codex request:', data.command || '[Continue/Resume]');
                    console.log('📁 Project:', codexProviderOptions?.projectPath || codexProviderOptions?.cwd || 'Unknown');
                    console.log('🤖 Model:', codexProviderOptions?.model || 'default');
                    if (agentporchSessionId) {
                        // User messages are no longer persisted to conf.json pending state.
                        // Live transcript is maintained by the native runtime reducer.
                    }
                    const sessionModelState: LooseRecord = codexProviderOptions?.sessionId
                        ? await getSessionModelState(
                            codexProviderOptions?.projectPath || codexProviderOptions?.cwd || '',
                            codexProviderOptions.sessionId,
                        ).catch(() => ({}))
                        : {};
                    const codexOptions: LooseRecord = {
                        ...codexProviderOptions,
                        reasoningEffort: codexProviderOptions?.reasoningEffort || sessionModelState.reasoningEffort,
                        serviceTier: codexProviderOptions?.serviceTier || data.options?.serviceTier || '',
                    };
                    const codexPromptText = buildProviderPromptText(
                        data.command || '',
                        codexOptions?.attachments ?? data.options?.attachments,
                    );
                    const effectiveSessionId = codexOptions?.sessionId || data.sessionId || agentporchSessionId;
                    const result = await sendNativeMessage({
                        provider: 'codex',
                        sessionId: agentporchSessionId || effectiveSessionId || `codex-${Date.now()}`,
                        providerSessionId: codexManualRuntime?.providerSessionId || (isAgentPorchRouteSessionId(effectiveSessionId) ? '' : effectiveSessionId) || '',
                        projectPath: codexOptions?.projectPath || codexOptions?.cwd || '',
                        text: codexPromptText,
                        runningBehavior: data.options?.runningBehavior || (data.options?.activePolicy === 'queue' ? 'queue' : undefined),
                        model: codexOptions?.model || '',
                        serviceTier: codexOptions?.serviceTier || '',
                        reasoningEffort: codexOptions?.reasoningEffort || '',
                        permissionMode: codexOptions?.permissionMode || '',
                        clientRequestId: routeInitToken || data.clientRequestId || null,
                        turnAnchorKey: data.turnAnchorKey || data.options?.turnAnchorKey || '',
                        writer: codexRuntimeWriter,
                    });
                    if (result?.accepted && agentporchSessionId && result.providerSessionId && result.providerSessionId !== agentporchSessionId) {
                        await finalizeAgentPorchRouteSession({
                            projectName: codexProviderOptions?.projectName || data.options?.projectName || '',
                            projectPath: codexProviderOptions?.projectPath || codexProviderOptions?.cwd || '',
                            provider: 'codex',
                            agentporchSessionId,
                            routeInitToken,
                            providerSessionId: result.providerSessionId,
                        });
                    }
                    // Codex accepted/rejected is handled by the runtime via
                    // message-accepted / steer-rejected / codex-error through the
                    // writer.  Do NOT duplicate accepted sends here.
                } else if (data.type === 'pi-command') {
                    if (!acceptChatRequestId(data.clientRequestId || data.options?.clientRequestId)) {
                        console.warn('[DEBUG] Ignoring duplicate Pi request:', data.clientRequestId || data.options?.clientRequestId);
                        return;
                    }
                    const resolvedOptions = await resolveChatProjectOptions(data.options, extractProjectDirectory) as LooseRecord;
                    let {
                        agentporchSessionId,
                        routeInitToken,
                    } = resolveAgentPorchSessionStartContext(data, resolvedOptions);
                    if (!agentporchSessionId) {
                        agentporchSessionId = await resolveAgentPorchRouteSessionIdFromProviderSession('pi', data, resolvedOptions);
                    }
                    const piManualRuntime = agentporchSessionId
                        ? await readProviderSessionBinding(
                            resolvedOptions?.projectName || data.options?.projectName || '',
                            resolvedOptions?.projectPath || resolvedOptions?.cwd || '',
                            agentporchSessionId,
                        )
                        : null;
                    if (agentporchSessionId) {
                        // User messages are no longer persisted to conf.json pending state.
                    }
                    const shouldStartAgentPorchDraft = agentporchSessionId && (
                        !piManualRuntime?.providerSessionId
                        &&
                        (!resolvedOptions?.sessionId || isAgentPorchRouteSessionId(resolvedOptions.sessionId))
                        && (!data.sessionId || isAgentPorchRouteSessionId(data.sessionId))
                    );
                    const piProviderOptions = shouldStartAgentPorchDraft
                        ? { ...resolvedOptions, sessionId: undefined, resume: false }
                        : resolvedOptions;
                    const piSessionIndexContext = agentporchSessionId ? {
                        projectName: piProviderOptions?.projectName || data.options?.projectName || '',
                        projectPath: piProviderOptions?.projectPath || piProviderOptions?.cwd || '',
                        provider: 'pi',
                        agentporchSessionId,
                        routeInitToken,
                    } : null;
                    if (piSessionIndexContext) {
                        rememberChatClientScope(ws, {
                            ...piSessionIndexContext,
                            clientRequestId: routeInitToken || data.clientRequestId || data.options?.clientRequestId || '',
                            providerSessionId: piManualRuntime?.providerSessionId || '',
                        }, chatClientUsers.get(ws) || null);
                    }
                    const piRuntimeWriter = adaptRuntimeWriter(piSessionIndexContext
                        ? writer.withSessionIndexContext(piSessionIndexContext)
                        : writer);
                    if (shouldStartAgentPorchDraft) {
                        const startResult = await initManualSessionRoute(
                            piProviderOptions?.projectName || data.options?.projectName || '',
                            piProviderOptions?.projectPath || piProviderOptions?.cwd || '',
                            agentporchSessionId,
                            'pi',
                        );
                        if (!startResult.started && startResult.reason !== 'already-started') {
                            writer.send({
                                type: 'session-start-rejected',
                                sessionId: agentporchSessionId,
                                agentporchSessionId,
                                provider: 'pi',
                                reason: startResult.reason,
                            });
                            return;
                        }
                        await updateManualRouteTitleFromCommand({
                            projectName: piProviderOptions?.projectName || data.options?.projectName || '',
                            projectPath: piProviderOptions?.projectPath || piProviderOptions?.cwd || '',
                            provider: 'pi',
                            agentporchSessionId,
                            command: data.command || '',
                        });
                    }
                    console.log('[DEBUG] Pi request:', data.command || '[Continue/Resume]');
                    console.log('📁 Project:', piProviderOptions?.projectPath || piProviderOptions?.cwd || 'Unknown');
                    if (agentporchSessionId) {
                        // User messages are no longer persisted to conf.json pending state.
                    }
                    const piPromptText = buildProviderPromptText(
                        data.command || '',
                        piProviderOptions?.attachments ?? data.options?.attachments,
                    );
                    const effectiveSessionId = piProviderOptions?.sessionId || data.sessionId || agentporchSessionId;
                    const result = await sendNativeMessage({
                        provider: 'pi',
                        sessionId: agentporchSessionId || effectiveSessionId || `pi-${Date.now()}`,
                        providerSessionId: piManualRuntime?.providerSessionId || (isAgentPorchRouteSessionId(effectiveSessionId) ? '' : effectiveSessionId) || '',
                        projectPath: piProviderOptions?.projectPath || piProviderOptions?.cwd || '',
                        text: piPromptText,
                        runningBehavior: data.options?.runningBehavior || (data.options?.activePolicy === 'steer' ? 'steer' : data.options?.activePolicy === 'followUp' ? 'followUp' : undefined),
                        model: piProviderOptions?.model || data.options?.model || '',
                        thinkingLevel: piProviderOptions?.thinkingLevel || data.options?.thinkingLevel || '',
                        permissionMode: piProviderOptions?.permissionMode || '',
                        clientRequestId: routeInitToken || data.clientRequestId || null,
                        turnAnchorKey: data.turnAnchorKey || data.options?.turnAnchorKey || '',
                        writer: piRuntimeWriter,
                    });
                    if (result?.accepted && agentporchSessionId && result.providerSessionId && result.providerSessionId !== agentporchSessionId) {
                        await finalizeAgentPorchRouteSession({
                            projectName: piProviderOptions?.projectName || data.options?.projectName || '',
                            projectPath: piProviderOptions?.projectPath || piProviderOptions?.cwd || '',
                            provider: 'pi',
                            agentporchSessionId,
                            routeInitToken,
                            providerSessionId: result.providerSessionId,
                        });
                    }
                    // Pi accepted/rejected is handled by the runtime via
                    // preflightResult callback (success→message-accepted,
                    // failure→message-rejected).  Session init failures are
                    // also reported by the runtime via pi-error through the
                    // writer.  Do NOT duplicate error/accepted sends here.
                } else if (data.type === 'claude-command') {
                    if (!acceptChatRequestId(data.clientRequestId || data.options?.clientRequestId)) {
                        console.warn('[DEBUG] Ignoring duplicate Claude request:', data.clientRequestId || data.options?.clientRequestId);
                        return;
                    }
                    const resolvedOptions = await resolveChatProjectOptions(data.options, extractProjectDirectory) as LooseRecord;
                    let {
                        agentporchSessionId,
                        routeInitToken,
                    } = resolveAgentPorchSessionStartContext(data, resolvedOptions);
                    if (!agentporchSessionId) {
                        agentporchSessionId = await resolveAgentPorchRouteSessionIdFromProviderSession('claude', data, resolvedOptions);
                    }
                    const claudeManualRuntime = agentporchSessionId
                        ? await readProviderSessionBinding(
                            resolvedOptions?.projectName || data.options?.projectName || '',
                            resolvedOptions?.projectPath || resolvedOptions?.cwd || '',
                            agentporchSessionId,
                        )
                        : null;
                    const shouldStartAgentPorchDraft = agentporchSessionId && (
                        !claudeManualRuntime?.providerSessionId
                        &&
                        (!resolvedOptions?.sessionId || isAgentPorchRouteSessionId(resolvedOptions.sessionId))
                        && (!data.sessionId || isAgentPorchRouteSessionId(data.sessionId))
                    );
                    const claudeProviderOptions = shouldStartAgentPorchDraft
                        ? { ...resolvedOptions, sessionId: undefined, resume: false }
                        : resolvedOptions;
                    const claudeSessionIndexContext = agentporchSessionId ? {
                        projectName: claudeProviderOptions?.projectName || data.options?.projectName || '',
                        projectPath: claudeProviderOptions?.projectPath || claudeProviderOptions?.cwd || '',
                        provider: 'claude',
                        agentporchSessionId,
                        routeInitToken,
                    } : null;
                    if (claudeSessionIndexContext) {
                        rememberChatClientScope(ws, {
                            ...claudeSessionIndexContext,
                            clientRequestId: routeInitToken || data.clientRequestId || data.options?.clientRequestId || '',
                            providerSessionId: claudeManualRuntime?.providerSessionId || '',
                        }, chatClientUsers.get(ws) || null);
                    }
                    const claudeRuntimeWriter = adaptRuntimeWriter(claudeSessionIndexContext
                        ? writer.withSessionIndexContext(claudeSessionIndexContext)
                        : writer);
                    if (shouldStartAgentPorchDraft) {
                        const startResult = await initManualSessionRoute(
                            claudeProviderOptions?.projectName || data.options?.projectName || '',
                            claudeProviderOptions?.projectPath || claudeProviderOptions?.cwd || '',
                            agentporchSessionId,
                            'claude',
                        );
                        if (!startResult.started && startResult.reason !== 'already-started') {
                            writer.send({
                                type: 'session-start-rejected',
                                sessionId: agentporchSessionId,
                                agentporchSessionId,
                                provider: 'claude',
                                reason: startResult.reason,
                            });
                            return;
                        }
                        await updateManualRouteTitleFromCommand({
                            projectName: claudeProviderOptions?.projectName || data.options?.projectName || '',
                            projectPath: claudeProviderOptions?.projectPath || claudeProviderOptions?.cwd || '',
                            provider: 'claude',
                            agentporchSessionId,
                            command: data.command || '',
                        });
                    }
                    console.log('[DEBUG] Claude request:', data.command || '[Continue/Resume]');
                    console.log('📁 Project:', claudeProviderOptions?.projectPath || claudeProviderOptions?.cwd || 'Unknown');
                    const claudePromptText = buildProviderPromptText(
                        data.command || '',
                        claudeProviderOptions?.attachments ?? data.options?.attachments,
                    );
                    const effectiveSessionId = claudeProviderOptions?.sessionId || data.sessionId || agentporchSessionId;
                    await sendClaudeMessage({
                        sessionId: agentporchSessionId || effectiveSessionId || `claude-${Date.now()}`,
                        providerSessionId: claudeManualRuntime?.providerSessionId || (isAgentPorchRouteSessionId(effectiveSessionId) ? '' : effectiveSessionId) || '',
                        projectPath: claudeProviderOptions?.projectPath || claudeProviderOptions?.cwd || '',
                        text: claudePromptText,
                        clientRequestId: routeInitToken || data.clientRequestId || null,
                        writer: claudeRuntimeWriter,
                    });
                    // The adapter owns lifecycle acknowledgements and errors.
                } else if (data.type === 'abort-session') {
                    console.log('[DEBUG] Abort session request:', data.sessionId);
                    const provider = normalizeManualProvider(data.provider || 'codex');
                    const agentporchSessionId = isAgentPorchRouteSessionId(data.agentporchSessionId || data.sessionId)
                        ? (data.agentporchSessionId || data.sessionId)
                        : null;
                    if (agentporchSessionId) {
                        // Cancel state is no longer persisted to conf.json.
                    }
                    const result = provider === 'claude'
                        ? await abortClaudeSession(agentporchSessionId || data.sessionId, data.projectPath || data.options?.projectPath || data.options?.cwd || '')
                        : await abortNativeSession(provider, agentporchSessionId || data.sessionId, data.projectPath || data.options?.projectPath || data.options?.cwd || '');
                    writer.send({
                        type: 'session-aborted',
                        sessionId: data.sessionId,
                        agentporchSessionId,
                        provider,
                        projectPath: data.projectPath || data.options?.projectPath || data.options?.cwd || '',
                        success: result.aborted,
                    });} else if (data.type === 'claude-permission-response') {
                    writer.send({ type: 'claude-error', error: 'Claude Code uses local tool permission settings; browser permission overrides are unavailable' });
                } else if (data.type === 'subscribe-session') {
                    const provider = normalizeManualProvider(data.provider || 'codex');
                    rememberChatClientScope(ws, {
                        ...data,
                        provider,
                        projectName: data.projectName || data.options?.projectName || '',
                        projectPath: data.projectPath || data.options?.projectPath || data.options?.cwd || '',
                    }, chatClientUsers.get(ws) || null);
                    sessionSubscriptionRegistry?.setClientScope(ws, {
                        userId: chatClientUsers.get(ws) || null,
                        provider,
                        projectName: data.projectName || data.options?.projectName || '',
                        projectPath: data.projectPath || data.options?.projectPath || data.options?.cwd || '',
                        sessionId: data.sessionId || data.agentporchSessionId || data.agentporch_session_id || '',
                        agentporchSessionId: data.agentporchSessionId || data.agentporch_session_id || data.sessionId || '',
                    });
                    writer.send({
                        type: 'session-subscribed',
                        provider,
                        projectName: data.projectName || data.options?.projectName || '',
                        projectPath: data.projectPath || data.options?.projectPath || data.options?.cwd || '',
                        sessionId: data.sessionId || data.agentporchSessionId || data.agentporch_session_id || '',
                        agentporchSessionId: data.agentporchSessionId || data.agentporch_session_id || data.sessionId || '',
                        agentporch_session_id: data.agentporchSessionId || data.agentporch_session_id || data.sessionId || '',
                    });
                } else if (data.type === 'check-session-status') {
                    const provider = normalizeManualProvider(data.provider || 'codex');
                    const sessionId = data.agentporchSessionId || data.agentporch_session_id || data.sessionId;
                    const status = provider === 'claude'
                        ? getClaudeSessionStatus(sessionId, data.projectPath || data.options?.projectPath || data.options?.cwd || '')
                        : getNativeSessionStatus(provider, sessionId, data.projectPath || data.options?.projectPath || data.options?.cwd || '');
                    writer.send({
                        type: 'session-status',
                        sessionId,
                        agentporchSessionId: sessionId,
                        agentporch_session_id: sessionId,
                        provider,
                        projectPath: data.projectPath || data.options?.projectPath || data.options?.cwd || '',
                        isProcessing: status.isProcessing,
                        turnId: status.turnId || '',
                        turn_id: status.turnId || '',
                        turnStartedAt: status.turnStartedAt || '',
                        turn_started_at: status.turnStartedAt || '',
                    });} else if (data.type === 'get-active-sessions') {
                    const activeSessions = { ...getActiveNativeSessions(), claude: getActiveClaudeSessions() };
                    writer.send({
                        type: 'active-sessions',
                        sessions: activeSessions,
                    });} else if (data.type === 'ping') {
                    writer.send({
                        type: 'pong',
                        timestamp: data.timestamp || Date.now()
                    });
                }
        }

        function sendProtocolError(data: ChatInboundMessage | null, error: any): void {
            /**
             * PURPOSE: Map parse/dispatch failures to the provider-specific legacy
             * error envelope without letting the WebSocket handler know each branch body.
             */
            console.error('[ERROR] Chat WebSocket error:', error.message);
            let errorType = 'error';
            if (data?.type === 'claude-command') {
                errorType = 'claude-error';
            } else if (data?.type === 'codex-command') {
                errorType = 'codex-error';
            } else if (data?.type === 'pi-command') {
                errorType = 'pi-error';
            }
            writer.send({
                type: errorType,
                error: error.message
            });
        }

        function close(): void {
            /**
             * PURPOSE: Release per-client realtime state when the browser socket closes.
             */
            console.log('🔌 Chat client disconnected');
            // Remove from connected clients
            unregisterChatClient({ connectedClients, chatClientUsers }, ws);
        }

        return {
            dispatchChatCommand(data: ChatInboundMessage): void {
                routeChatCommand((message) => {
                    void handleChatCommand(message as ChatInboundMessage).catch(error => {
                        sendProtocolError(message as ChatInboundMessage, error);
                    });
                }, data);
            },
            sendProtocolError,
            close,
        };
    }
    return runChatConnection(ws, request);
}
