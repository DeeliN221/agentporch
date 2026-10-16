/** Claude Code's documented print/stream-json protocol; never a terminal relay. */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { buildPortableCodexSpawnEnv } from '../codex-app-server/stdio-transport.js';
import { resolveExecutablePath } from '../../executable-resolver.js';
import type { RuntimeWriter } from './runtime-session-store.js';

type Session = {
  routeId: string; providerId: string; projectPath: string; initialized: boolean;
  child: ChildProcessWithoutNullStreams | null; startedAt: string; turnId: string; aborting: boolean;
};
const sessions = new Map<string, Session>();
let shuttingDown = false;
const keyFor = (projectPath: string, id: string) => JSON.stringify([path.resolve(projectPath), id]);
function findSession(id: string, projectPath: string): Session | undefined {
  return sessions.get(keyFor(projectPath, id)) || [...sessions.values()].find(s =>
    s.providerId === id && s.projectPath === path.resolve(projectPath));
}

export function getClaudeSessionStatus(id: string, projectPath = '') {
  const session = findSession(id, projectPath);
  return { isProcessing: Boolean(session?.child), providerSessionId: session?.providerId,
    turnId: session?.child ? session.turnId : undefined,
    turnStartedAt: session?.child ? session.startedAt : undefined };
}
export function getActiveClaudeSessions() {
  return [...new Set(sessions.values())].filter(s => s.child).map(s => ({
    sessionId: s.routeId, providerSessionId: s.providerId, projectPath: s.projectPath,
    provider: 'claude', isProcessing: true, turnId: s.turnId, turnStartedAt: s.startedAt,
  }));
}
export async function abortClaudeSession(id: string, projectPath = '') {
  const session = findSession(id, projectPath);
  if (!session?.child) return { aborted: false };
  session.aborting = true;
  const child = session.child;
  child.kill('SIGINT');
  const timer = setTimeout(() => { if (session.child === child) child.kill('SIGTERM'); }, 5000);
  timer.unref();
  return { aborted: true };
}

export async function sendClaudeMessage(input: {
  sessionId: string; providerSessionId?: string; projectPath: string; text: string;
  clientRequestId?: string | null; writer: RuntimeWriter;
  onSessionReady?: (providerSessionId: string) => Promise<void>;
}): Promise<{ accepted: boolean; providerSessionId?: string }> {
  const projectPath = path.resolve(input.projectPath || process.cwd());
  const send = (event: Record<string, unknown>) => input.writer.send({
    provider: 'claude', sessionId: input.sessionId, projectPath,
    clientRequestId: input.clientRequestId, ...event,
  });
  if (input.providerSessionId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.providerSessionId)) {
    send({ type: 'claude-error', error: 'The selected Claude Code session ID is invalid.' });
    return { accepted: false };
  }
  if (shuttingDown) { send({ type: 'message-rejected', reason: 'The server is shutting down.' }); return { accepted: false }; }
  const existing = findSession(input.sessionId, projectPath)
    || (input.providerSessionId ? findSession(input.providerSessionId, projectPath) : undefined);
  const providerOwner = input.providerSessionId && [...sessions.values()].find(s => s.providerId === input.providerSessionId && s.child);
  if (existing?.child || providerOwner) {
    send({ type: 'message-rejected', reason: 'Claude Code is already working. Stop it or wait before sending another message.' });
    return { accepted: false };
  }
  const env = buildPortableCodexSpawnEnv();
  const executable = resolveExecutablePath('claude', { env });
  if (!executable) {
    send({ type: 'claude-error', error: 'Claude Code CLI is unavailable. Install it and sign in on the server.' });
    return { accepted: false };
  }
  const session: Session = existing || {
    routeId: input.sessionId, providerId: input.providerSessionId || randomUUID(), projectPath,
    initialized: Boolean(input.providerSessionId), child: null, startedAt: '', turnId: '', aborting: false,
  };
  sessions.set(keyFor(projectPath, input.sessionId), session);
  session.startedAt = new Date().toISOString();
  session.turnId = randomUUID();
  session.aborting = false;
  // Prompts go through stdin, never shell interpolation or process arguments.
  // Omit permission/model overrides to preserve Claude's own local settings.
  const args = ['-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
    session.initialized ? '--resume' : '--session-id', session.providerId];
  const environmentFile = process.env.AGENTPORCH_CLAUDE_ENV_FILE?.trim();
  if (environmentFile && process.platform === 'win32') {
    send({ type: 'claude-error', error: 'Claude environment files require a POSIX host. Configure the service environment on Windows.' });
    return { accepted: false };
  }
  // Reuse the terminal's optional trusted provider configuration, passing every
  // value as a positional argument rather than interpolating it into shell code.
  const child = environmentFile
    ? spawn('/bin/sh', ['-c', '[ -f "$1" ] || { echo "Claude environment file is missing" >&2; exit 1; }; . "$1" || exit; shift; exec "$@"',
      'agentporch-claude', path.resolve(environmentFile), executable, ...args], { cwd: projectPath, env, stdio: ['pipe', 'pipe', 'pipe'] })
    : spawn(executable, args, { cwd: projectPath, env, stdio: ['pipe', 'pipe', 'pipe'] });
  session.child = child;
  let buffer = '', stderr = '', failure = '', sawResult = false, streamedText = false;
  let accepted = false;
  let resolveAdmission!: (value: { accepted: boolean; providerSessionId?: string }) => void;
  const admission = new Promise<{ accepted: boolean; providerSessionId?: string }>(resolve => { resolveAdmission = resolve; });
  const initTimeout = setTimeout(() => {
    failure = 'Claude Code did not confirm session initialization. Check history before retrying.';
    child.kill('SIGTERM');
  }, 30_000);
  initTimeout.unref();
  let eventQueue = Promise.resolve();
  const decoder = new StringDecoder('utf8');
  const consume = async (line: string) => {
    if (!line.trim()) return;
    let event: any;
    try { event = JSON.parse(line); } catch { failure = 'Claude Code returned invalid stream JSON.'; child.kill('SIGTERM'); return; }
    if (!event || typeof event !== 'object') { failure = 'Claude Code returned an invalid stream event.'; child.kill('SIGTERM'); return; }
    if (event.type === 'system' && event.subtype === 'init') {
      if (typeof event.session_id !== 'string' || event.session_id !== session.providerId) {
        failure = 'Claude Code returned a different session identity.';
        child.kill('SIGTERM'); return;
      }
      if (accepted) return;
      await input.onSessionReady?.(session.providerId);
      session.initialized = true;
      accepted = true;
      clearTimeout(initTimeout);
      send({ type: 'session-created', sessionId: session.providerId });
      send({ type: 'message-accepted' });
      send({ type: 'session-status', isProcessing: true, turnId: session.turnId, turnStartedAt: session.startedAt });
      resolveAdmission({ accepted: true, providerSessionId: session.providerId });
    } else if (event.type === 'stream_event') {
      if (event.event?.type === 'message_start') streamedText = false;
      if (event.event?.type === 'content_block_delta' && event.event.delta?.text) streamedText = true;
      send({ type: 'claude-response', data: event.event });
    } else if (event.type === 'assistant' || event.type === 'user') {
      const content = Array.isArray(event.message?.content) ? event.message.content : [];
      // Partial text is already displayed; the full message still supplies tool calls.
      send({ type: 'claude-response', data: { ...event.message,
        content: content.filter((part: any) => !(streamedText && event.type === 'assistant' && part.type === 'text')),
        parentToolUseId: event.parent_tool_use_id,
      } });
    } else if (event.type === 'result') {
      sawResult = true;
      if (event.is_error || event.subtype !== 'success') {
        failure = event.errors?.join('\n') || event.result || `Claude Code ended with ${event.subtype || 'an error'}.`;
      }
      if (Array.isArray(event.permission_denials) && event.permission_denials.length) {
        send({ type: 'claude-error', error: 'Some tools were denied by Claude Code permissions. Review the local Claude Code settings before retrying.' });
      }
    }
  };
  child.stdout.on('data', chunk => {
    buffer += decoder.write(chunk);
    if (buffer.length > 16 * 1024 * 1024) { failure = 'Claude Code stream frame exceeded the size limit.'; child.kill('SIGTERM'); return; }
    let newline: number;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
      eventQueue = eventQueue.then(() => consume(line)).catch(error => { failure = error.message; child.kill('SIGTERM'); });
    }
  });
  child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-8192); });
  child.stdin.on('error', error => { failure = error.message; });
  child.on('error', error => { failure = error.message; });
  child.on('close', code => {
    clearTimeout(initTimeout);
    buffer += decoder.end();
    eventQueue = eventQueue.then(async () => {
    if (buffer.trim()) await consume(buffer);
    resolveAdmission({ accepted: false });
    session.child = null;
    if (session.aborting) send({ type: 'session-aborted', success: true });
    else if (failure || code !== 0 || !sawResult) send({ type: 'claude-error', error: failure || stderr || 'Claude Code exited without a result.' });
    send({ type: 'claude-complete', actualSessionId: session.initialized ? session.providerId : '', exitCode: failure || !sawResult ? 1 : code });
    send({ type: 'session-status', isProcessing: false });
    }).catch(error => {
      session.child = null;
      send({ type: 'claude-error', error: error.message });
      resolveAdmission({ accepted: false });
    });
  });
  child.once('spawn', () => { child.stdin.end(input.text); });
  return admission;
}

/** Service shutdown owns child cleanup; browser disconnects never call this. */
export async function closeClaudeSessions(): Promise<void> {
  shuttingDown = true;
  await Promise.all([...new Set(sessions.values())].map(session => new Promise<void>(resolve => {
    const child = session.child;
    if (!child) { resolve(); return; }
    session.aborting = true;
    const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
    child.once('close', () => { clearTimeout(timer); resolve(); });
    child.kill('SIGTERM');
  })));
}
