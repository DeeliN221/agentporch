/**
 * Batch high-frequency provider TUI output to reduce WebSocket traffic and rendering.
 * Throttle passive state updates while preserving low-latency feedback for user input.
 */
import type { WebSocket } from 'ws';

export const PROVIDER_TUI_OUTPUT_INTERVAL_MS = 16;
export const PROVIDER_TUI_INTERACTIVE_OUTPUT_DELAY_MS = 16;
export const SHELL_REPLAY_BATCH_LIMIT = 60;

export type ShellOutputSession = {
    ws?: WebSocket | null;
    buffer?: string[];
    pendingOutput?: string;
    outputFlushTimer?: NodeJS.Timeout | null;
    interactiveOutputPending?: boolean;
};

type WebSocketState = {
    OPEN: number;
};

type QueueShellOutputOptions = {
    session: ShellOutputSession;
    data: string;
    isPlainShell: boolean;
    WebSocketState: WebSocketState;
    intervalMs?: number;
    interactiveDelayMs?: number;
};

/**
 * Retain a small bounded replay buffer when tmux screen snapshots are unavailable.
 */
function appendReplayBatch(session: ShellOutputSession, data: string): void {
    const replayBuffer = session.buffer || (session.buffer = []);
    replayBuffer.push(data);
    if (replayBuffer.length > SHELL_REPLAY_BATCH_LIMIT) {
        replayBuffer.splice(0, replayBuffer.length - SHELL_REPLAY_BATCH_LIMIT);
    }
}

/**
 * Flush batched output immediately, retaining only bounded recovery data while disconnected.
 */
export function flushShellOutput(session: ShellOutputSession, WebSocketState: WebSocketState): boolean {
    if (session.outputFlushTimer) {
        clearTimeout(session.outputFlushTimer);
        session.outputFlushTimer = null;
    }

    const output = session.pendingOutput || '';
    session.pendingOutput = '';
    if (!output) {
        return false;
    }

    appendReplayBatch(session, output);
    if (!session.ws || session.ws.readyState !== WebSocketState.OPEN) {
        return false;
    }

    session.ws.send(JSON.stringify({
        type: 'output',
        data: output,
    }));
    return true;
}

/**
 * Send shell output immediately; batch provider TUI output at the default 16ms interval.
 */
export function queueShellOutput({
    session,
    data,
    isPlainShell,
    WebSocketState,
    intervalMs = PROVIDER_TUI_OUTPUT_INTERVAL_MS,
    interactiveDelayMs = PROVIDER_TUI_INTERACTIVE_OUTPUT_DELAY_MS,
}: QueueShellOutputOptions): void {
    if (!data) {
        return;
    }

    session.pendingOutput = `${session.pendingOutput || ''}${data}`;
    if (isPlainShell) {
        flushShellOutput(session, WebSocketState);
        return;
    }

    if (session.outputFlushTimer) {
        return;
    }

    const delayMs = session.interactiveOutputPending ? interactiveDelayMs : intervalMs;
    session.interactiveOutputPending = false;
    session.outputFlushTimer = setTimeout(() => {
        session.outputFlushTimer = null;
        flushShellOutput(session, WebSocketState);
    }, delayMs);
}

/**
 * Mark the next output as user-triggered and include queued state in low-latency feedback.
 */
export function markShellOutputInteractive(
    session: ShellOutputSession,
    WebSocketState: WebSocketState,
    interactiveDelayMs = PROVIDER_TUI_INTERACTIVE_OUTPUT_DELAY_MS,
): void {
    session.interactiveOutputPending = true;
    if (!session.pendingOutput) {
        return;
    }

    if (session.outputFlushTimer) {
        clearTimeout(session.outputFlushTimer);
    }
    session.interactiveOutputPending = false;
    session.outputFlushTimer = setTimeout(() => {
        session.outputFlushTimer = null;
        flushShellOutput(session, WebSocketState);
    }, interactiveDelayMs);
}

/**
 * Clear pending output during snapshot restoration or destruction to prevent duplicate rendering.
 */
export function resetShellOutputQueue(session: ShellOutputSession): void {
    if (session.outputFlushTimer) {
        clearTimeout(session.outputFlushTimer);
    }
    session.outputFlushTimer = null;
    session.pendingOutput = '';
    session.interactiveOutputPending = false;
}

/**
 * Take and clear bounded replay data so reconnect sends one fallback message.
 */
export function takeShellReplay(session: ShellOutputSession): string {
    const replay = (session.buffer || []).join('');
    session.buffer = [];
    return replay;
}
