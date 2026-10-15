/**
 * Encapsulate tmux commands using project sessions and per-conversation windows.
 * Reuse one tmux session per project while isolating browser conversations in windows.
 */
import { createHash } from 'node:crypto';

export type TmuxTerminalRuntime = {
  sessionName: string;
  windowName: string;
  target: string;
  legacySessionNames: string[];
  hasSession: () => string[];
  createSession: (shellCommand: string) => string[];
  createWindow: (shellCommand: string) => string[];
  attachSession: () => string[];
  capturePane: () => string[];
  sendKeys: (input: string) => string[];
  terminateTerminal: (activeTarget?: string) => string[];
};

/**
 * Generate legacy base64 names for existing background-terminal compatibility.
 */
export function createLegacyTmuxSessionName(rawKey: string): string {
  return `agentporch_${Buffer.from(rawKey).toString('base64url').slice(0, 48)}`;
}

/**
 * Generate project tmux names with hash suffixes to avoid directory-name collisions.
 */
export function createTmuxSessionName(rawKey: string): string {
  const parsed = parseTmuxRawKey(rawKey);
  if (!parsed) {
    return createLegacyTmuxSessionName(rawKey);
  }

  const projectHash = shortHash(parsed.projectPath);
  const readableProject = sanitizeTmuxName(getProjectPathSuffix(parsed.projectPath), 60);
  return `agentporch_${readableProject}_${projectHash}`;
}

/**
 * Generate window names supporting concurrent providers and routes in one project.
 */
export function createTmuxWindowName(rawKey: string): string {
  const parsed = parseTmuxRawKey(rawKey);
  if (!parsed) {
    return sanitizeTmuxName(`terminal_${shortHash(rawKey)}`, 48);
  }

  const identity = parsed.routeSessionId || parsed.providerSessionId || parsed.identity || 'new';
  const commandSuffix = parsed.commandId ? `_${parsed.commandId}` : '';
  const candidate = `${parsed.provider}_${identity}${commandSuffix}`;
  const normalized = sanitizeTmuxName(candidate, 256);
  if (normalized === candidate && normalized.length <= 48) {
    return normalized;
  }
  return `${normalized.slice(0, 39)}_${shortHash(candidate)}`;
}

/**
 * Centralize shell-relay tmux lifecycle command arguments.
 */
export function createTmuxTerminalRuntime(rawKey: string): TmuxTerminalRuntime {
  const sessionName = createTmuxSessionName(rawKey);
  const windowName = createTmuxWindowName(rawKey);
  const target = `${sessionName}:${windowName}`;
  const legacySessionName = createLegacyTmuxSessionName(rawKey);
  const previousSessionName = createPreviousTmuxSessionName(rawKey);
  const legacySessionNames = Array.from(new Set([previousSessionName, legacySessionName]))
    .filter((name) => name !== sessionName);

  return {
    sessionName,
    windowName,
    target,
    legacySessionNames,
    hasSession: () => ['tmux', 'has-session', '-t', target],
    createSession: (shellCommand: string) => ['tmux', 'new-session', '-d', '-s', sessionName, '-n', windowName, shellCommand],
    createWindow: (shellCommand: string) => ['tmux', 'new-window', '-d', '-t', sessionName, '-n', windowName, shellCommand],
    attachSession: () => ['tmux', 'attach-session', '-t', target],
    capturePane: () => ['tmux', 'capture-pane', '-p', '-t', target],
    sendKeys: (input: string) => ['tmux', 'send-keys', '-t', target, input],
    terminateTerminal: (activeTarget = target) => activeTarget === target
      ? ['tmux', 'kill-window', '-t', target]
      : ['tmux', 'kill-session', '-t', activeTarget],
  };
}

/**
 * Generate the previous per-conversation session name only for seamless reconnect and cleanup.
 */
function createPreviousTmuxSessionName(rawKey: string): string {
  const parsed = parseTmuxRawKey(rawKey);
  if (!parsed) {
    return createLegacyTmuxSessionName(rawKey);
  }
  const routeOrSession = parsed.routeSessionId || parsed.providerSessionId || 'new';
  return sanitizeTmuxName(`agentporch_${getProjectPathSuffix(parsed.projectPath)}_${routeOrSession}`, 80);
}

/**
 * Extract project path and session identity from the raw shell-relay key.
 */
function parseTmuxRawKey(rawKey: string): {
  projectPath: string;
  provider: string;
  identity: string;
  routeSessionId: string;
  providerSessionId: string;
  commandId: string;
} | null {
  const match = String(rawKey || '').match(/^(.*)_(codex|pi|claude|plain-shell)_(.*?)(?:_cmd_[A-Za-z0-9+/=_-]+)?$/);
  if (!match) {
    return null;
  }

  const identity = match[3] || '';
  const routeMatch = identity.match(/^route:(c\d+)$/) || identity.match(/^(c\d+)(?:_|$)/);
  const providerMatch = identity.match(/^provider:(.+)$/);
  return {
    projectPath: match[1] || 'project',
    provider: match[2] || 'terminal',
    identity,
    routeSessionId: routeMatch?.[1] || '',
    providerSessionId: providerMatch?.[1] || '',
    commandId: String(rawKey || '').match(/_cmd_([A-Za-z0-9+/=_-]+)$/)?.[1] || '',
  };
}

/** Hash long paths into short, stable collision-avoidance suffixes. */
function shortHash(value: string): string {
  return createHash('sha256').update(String(value)).digest('hex').slice(0, 8);
}

/**
 * Use the final two project path components for a short display path.
 */
function getProjectPathSuffix(projectPath: string): string {
  const segments = String(projectPath || 'project')
    .replace(/\\/g, '/')
    .replace(/\/+$/g, '')
    .split('/')
    .filter(Boolean);
  return segments.slice(-2).join('_') || 'project';
}

/**
 * Convert path-style names to tmux-safe names.
 *
 * tmux forbids dots and colons in session names; apply a conservative allowlist,
 * including safe handling of whitespace, Unicode, and shell metacharacters.
 */
function sanitizeTmuxName(value: string, maxLength: number): string {
  return value
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, maxLength) || 'agentporch_terminal';
}
