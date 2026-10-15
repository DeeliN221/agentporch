/**
 * Purpose: ensure browser terminal tmux session names always satisfy tmux restrictions.
 * Terminals must still be creatable, reconnectable, and terminable when project paths contain versions or special characters.
 */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { handleShellConnection } from '../../backend/server/shell-websocket.ts';
import {
  createTmuxSessionName,
  createTmuxTerminalRuntime,
  createTmuxWindowName,
} from '../../backend/server/terminal-tmux-runtime.ts';

const execFileAsync = promisify(execFile);

test('dots in project paths are normalized', () => {
  /**
   * Versioned directories are common, but tmux explicitly disallows dots in session names.
   */
  const rawKey = '/home/example/projects/sample-group/sample-project-1.9_codex_route:c1';
  assert.match(createTmuxSessionName(rawKey), /^agentporch_sample-group_sample-project-1_9_[a-f0-9]{8}$/);
  assert.equal(createTmuxWindowName(rawKey), 'codex_c1');
});

test('sessions are shared within a project while conversations use separate windows', () => {
  /**
   * Project identity determines the session; provider and cN route together determine the window.
   */
  const codex = createTmuxTerminalRuntime('/home/example/projects/agentporch_codex_route:c1');
  const pi = createTmuxTerminalRuntime('/home/example/projects/agentporch_pi_route:c2');

  assert.equal(codex.sessionName, pi.sessionName);
  assert.equal(codex.windowName, 'codex_c1');
  assert.equal(pi.windowName, 'pi_c2');
  assert.notEqual(codex.target, pi.target);
  assert.deepEqual(codex.terminateTerminal(), ['tmux', 'kill-window', '-t', codex.target]);
  assert.deepEqual(
    codex.terminateTerminal(codex.legacySessionNames[0]),
    ['tmux', 'kill-session', '-t', codex.legacySessionNames[0]],
  );
});

test('tmux session names retain only allowlisted safe characters', () => {
  /**
   * Colons, whitespace, Unicode, brackets, and shell symbols use the same fallback rule.
   */
  const sessionName = createTmuxSessionName(
    '/home/example/projects/特殊 项目:v2/[draft]$x_codex_route:c8',
  );

  assert.match(sessionName, /^[A-Za-z0-9_-]+$/);
  assert.doesNotMatch(sessionName, /[.:]/);
});

test('identically named project paths and special session identifiers do not collide in tmux', () => {
  /**
   * Even when readable names match, hashes retain the full path and original session identity.
   */
  const left = createTmuxTerminalRuntime('/srv/team-a/projects/agentporch_codex_provider:a:b');
  const right = createTmuxTerminalRuntime('/srv/team-b/projects/agentporch_codex_provider:a.b');

  assert.notEqual(left.sessionName, right.sessionName);
  assert.notEqual(left.windowName, right.windowName);
  assert.ok(left.sessionName.length <= 80);
  assert.ok(left.windowName.length <= 48);
});

test('long project paths keep tmux session names within 80 characters', () => {
  const projectPath = `/srv/${'parent'.repeat(20)}/${'project'.repeat(20)}`;
  const sessionName = createTmuxSessionName(`${projectPath}_pi_route:c1`);
  assert.ok(sessionName.startsWith('agentporch_'));
  assert.equal(sessionName.length, 80);
  assert.notEqual(sessionName, createTmuxSessionName(`${projectPath}x_pi_route:c1`));
});

test('cards keep their provider window after receiving a route number', async (t) => {
  /**
   * Precreate a provider-identified window in real tmux, then simulate the session receiving a cN route.
   */
  if (process.platform === 'win32') return t.skip('tmux lifecycle is POSIX-only');
  try {
    await execFileAsync('tmux', ['-V']);
  } catch {
    return t.skip('tmux is not installed');
  }

  const testRoot = await mkdtemp(path.join(tmpdir(), 'agentporch-tmux-reuse-'));
  // Force the legacy c9 name to be a prefix of the hashed project session.
  let projectPath = '';
  for (let candidate = 0; candidate < 100_000; candidate += 1) {
    projectPath = path.join(testRoot, `project-${candidate}`);
    if (createTmuxSessionName(`${projectPath}_pi_route:c9`).split('_').at(-1)?.startsWith('c9')) break;
  }
  assert.match(createTmuxSessionName(`${projectPath}_pi_route:c9`), /_c9[a-f0-9]{6}$/);
  await mkdir(projectPath);
  const providerSessionId = 'provider-reuse-123';
  const providerKey = `${projectPath}_pi_provider:${providerSessionId}`;
  const runtime = createTmuxTerminalRuntime(providerKey);
  const handlers = new Map<string, (...args: any[]) => any>();
  const ptySessionsMap = new Map();
  let launchedCommand = '';
  const fakePty = {
    pid: 99,
    write() { /** The scenario does not send terminal input. */ },
    resize() { /** The scenario keeps its initial dimensions. */ },
    kill() { /** Cleanup is handled by the isolated tmux session. */ },
    onData() { /** No process output is required for identity selection. */ },
    onExit() { /** The fake relay stays active during the assertion. */ },
  };
  const socket = {
    readyState: 1,
    on(event: string, handler: (...args: any[]) => any) {
      /** Expose WebSocket callbacks so the test can drive init. */
      handlers.set(event, handler);
    },
    send() { /** The terminal welcome frame does not affect window selection. */ },
  };

  try {
    const createArgs = runtime.createSession('sleep 30');
    await execFileAsync(createArgs[0], createArgs.slice(1));
    handleShellConnection({
      ptySessionsMap,
      PTY_SESSION_TIMEOUT: 300_000,
      SHELL_URL_PARSE_BUFFER_LIMIT: 1024,
      stripAnsiSequences: (value: string) => value,
      normalizeDetectedUrl: () => null,
      extractUrlsFromText: () => [],
      shouldAutoOpenUrlFromOutput: () => false,
      os: { platform: () => 'linux', homedir: () => projectPath },
      WebSocket: { OPEN: 1 },
      loadNodePtyRuntime: async () => ({ spawn: (_shell: string, args: string[]) => {
        /** Capture the command selected for the real tmux relay. */
        launchedCommand = args[1];
        return fakePty;
      } }),
    }, socket as any);
    await handlers.get('message')?.(JSON.stringify({
      type: 'init', provider: 'pi', projectPath, routeSessionId: 'c9',
      providerSessionId, riskConfirmed: true,
    }));

    assert.equal(ptySessionsMap.get(providerKey)?.tmuxTarget, runtime.target);
    assert.match(launchedCommand, /tmux attach-session -t/);
    assert.equal((await execFileAsync('tmux', ['list-windows', '-t', runtime.sessionName, '-F', '#{window_id}'])).stdout.trim().split('\n').length, 1);
  } finally {
    await execFileAsync('tmux', ['kill-session', '-t', runtime.sessionName]).catch(() => undefined);
    await rm(testRoot, { recursive: true, force: true });
  }
});

test('disconnected silent windows are reclaimed after the grace period', async (t) => {
  /**
   * Use an isolated tmux session and a shorter grace period to verify actual cleanup rather than command strings.
   */
  if (process.platform === 'win32') {
    t.skip('tmux lifecycle is POSIX-only');
    return;
  }
  try {
    await execFileAsync('tmux', ['-V']);
  } catch {
    t.skip('tmux is not installed');
    return;
  }

  const projectPath = await mkdtemp(path.join(tmpdir(), 'agentporch-tmux-lifecycle-'));
  const rawKey = `${projectPath}_plain-shell_route:c9`;
  const runtime = createTmuxTerminalRuntime(rawKey);
  const handlers = new Map<string, (...args: any[]) => any>();
  const ptySessionsMap = new Map();
  const fakePty = {
    pid: 99,
    write() { /** No input is needed for the lifecycle scenario. */ },
    resize() { /** No resize is needed for the lifecycle scenario. */ },
    kill() { /** Killing the relay must leave cleanup to the tmux window timer. */ },
    onData() { /** The isolated tmux window intentionally remains silent. */ },
    onExit() { /** The fake relay does not emit an exit during this scenario. */ },
  };
  const socket = {
    readyState: 1,
    on(event: string, handler: (...args: any[]) => any) {
      /** Expose WebSocket callbacks so the test can drive init and close. */
      handlers.set(event, handler);
    },
    send() { /** Visible protocol output is irrelevant to tmux cleanup. */ },
  };

  try {
    const createArgs = runtime.createSession('sleep 10');
    await execFileAsync(createArgs[0], createArgs.slice(1));
    handleShellConnection({
      ptySessionsMap,
      PTY_SESSION_TIMEOUT: 40,
      SHELL_URL_PARSE_BUFFER_LIMIT: 1024,
      stripAnsiSequences: (value: string) => value,
      normalizeDetectedUrl: () => null,
      extractUrlsFromText: () => [],
      shouldAutoOpenUrlFromOutput: () => false,
      os: { platform: () => 'linux', homedir: () => projectPath },
      WebSocket: { OPEN: 1 },
      loadNodePtyRuntime: async () => ({ spawn: () => fakePty }),
    }, socket as any);
    await handlers.get('message')?.(JSON.stringify({
      type: 'init',
      provider: 'plain-shell',
      projectPath,
      routeSessionId: 'c9',
    }));
    await handlers.get('close')?.();
    await new Promise((resolve) => setTimeout(resolve, 180));
    await assert.rejects(execFileAsync('tmux', ['has-session', '-t', runtime.target]));
  } finally {
    await execFileAsync('tmux', ['kill-session', '-t', runtime.sessionName]).catch(() => undefined);
    await rm(projectPath, { recursive: true, force: true });
  }
});
