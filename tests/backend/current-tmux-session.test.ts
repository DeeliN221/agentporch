/**
 * Purpose: read the tmux window actually in focus and map it to the complete provider session.
 * After switching windows within a project, the transcript must not reuse the old cN session from the URL.
 */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import pty from 'node-pty';
import { createTmuxTerminalRuntime } from '../../backend/server/terminal-tmux-runtime.ts';
import { resolveCurrentTmuxSession } from '../../backend/server/current-tmux-session.ts';

const execFileAsync = promisify(execFile);

/**
 * Wait until the tmux client attaches and focuses the target window to avoid races on slow CI.
 */
async function waitForClientWindow(sessionName: string, windowName: string): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const { stdout } = await execFileAsync('tmux', [
      'list-clients', '-t', sessionName, '-F', '#{window_name}',
    ]);
    if (stdout.split(/\r?\n/).includes(windowName)) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const clients = await execFileAsync('tmux', ['list-clients', '-F', '#{session_name}:#{window_name}']);
  throw new Error(`tmux client did not focus ${windowName}; clients: ${clients.stdout.trim()}`);
}

test('resolve the attached client focused window rather than the first route window', async (t) => {
  if (process.platform === 'win32') {
    t.skip('tmux is POSIX-only');
    return;
  }
  try {
    await execFileAsync('tmux', ['-V']);
  } catch {
    t.skip('tmux is not installed');
    return;
  }

  const projectPath = await mkdtemp(path.join(tmpdir(), 'agentporch-tmux-focus-'));
  const codexRuntime = createTmuxTerminalRuntime(`${projectPath}_codex_route:c1`);
  const piRuntime = createTmuxTerminalRuntime(`${projectPath}_pi_route:c2`);
  let terminal: pty.IPty | null = null;
  try {
    await execFileAsync('tmux', [
      'new-session', '-d', '-c', projectPath, '-s', codexRuntime.sessionName,
      '-n', codexRuntime.windowName, 'sleep 120',
    ]);
    await execFileAsync('tmux', [
      'new-window', '-d', '-c', projectPath, '-t', codexRuntime.sessionName,
      '-n', piRuntime.windowName, 'sleep 120',
    ]);
    terminal = pty.spawn('bash', ['-lc', `tmux attach-session -t ${codexRuntime.sessionName}:${codexRuntime.windowName}`], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: projectPath,
      env: process.env,
    });
    await waitForClientWindow(codexRuntime.sessionName, codexRuntime.windowName);
    await execFileAsync('tmux', ['select-window', '-t', `${codexRuntime.sessionName}:${piRuntime.windowName}`]);
    await waitForClientWindow(codexRuntime.sessionName, piRuntime.windowName);

    const resolution = await resolveCurrentTmuxSession(projectPath, {
      getCodexSessions: async () => [{ id: 'codex-session', routeIndex: 1, projectPath, title: 'c1' }],
      getPiSessions: async () => [{ id: 'pi-session', routeIndex: 2, projectPath, title: 'c2' }],
      getClaudeSessions: async () => [],
    });

    assert.equal(resolution.status, 'resolved');
    assert.equal(resolution.provider, 'pi');
    assert.equal(resolution.routeSessionId, 'c2');
    assert.equal(resolution.session?.id, 'pi-session');
    assert.ok(['attached-client', 'active-pane'].includes(resolution.evidence?.source || ''));
    assert.equal(resolution.evidence?.windowName, piRuntime.windowName);
  } finally {
    terminal?.kill();
    await execFileAsync('tmux', ['kill-session', '-t', codexRuntime.sessionName]).catch(() => undefined);
    await rm(projectPath, { recursive: true, force: true });
  }
});

test('return unresolved when tmux exists but the current pane cannot be mapped, without inventing an old route', async () => {
  const projectPath = '/tmp/agentporch-unresolved-project';
  const resolution = await resolveCurrentTmuxSession(projectPath, {
    getCodexSessions: async () => [],
    getPiSessions: async () => [],
    getClaudeSessions: async () => [],
    execFile: async () => ({ stdout: 'unrelated-session\n', stderr: '' }) as any,
  });

  assert.equal(resolution.status, 'no-tmux');
  assert.equal(resolution.session, null);
});

/** A split must use its own live process, even when its shared window names another session. */
test('split panes select their own provider sessions and an empty pane never falls back to latest', async () => {
  const { writeFile } = await import('node:fs/promises');
  const projectPath = await mkdtemp(path.join(tmpdir(), 'agentporch-pane-focus-'));
  const runtime = createTmuxTerminalRuntime(`${projectPath}_codex_route:c1`);
  const cli = path.join(projectPath, 'codex');
  await writeFile(cli, `#!${process.execPath}\nsetInterval(() => {}, 1000);\n`, { mode: 0o770 });
  let terminal: pty.IPty | null = null;
  try {
    await execFileAsync('tmux', ['new-session', '-d', '-c', projectPath, '-s', runtime.sessionName, '-n', runtime.windowName, `${cli} resume session-left`]);
    await execFileAsync('tmux', ['split-window', '-h', '-c', projectPath, '-t', runtime.target, `${cli} resume session-right`]);
    terminal = pty.spawn('tmux', ['attach-session', '-t', runtime.target], { name: 'xterm-256color', cols: 120, rows: 36, cwd: projectPath, env: process.env });
    terminal.onData(() => {});
    await waitForClientWindow(runtime.sessionName, runtime.windowName);
    const deps = {
      terminalPid: terminal.pid,
      getCodexSessions: async () => [{ id: 'session-left', routeIndex: 1 }, { id: 'session-right', routeIndex: 2 }, { id: 'latest-unrelated', routeIndex: 3, lastActivity: '2099-01-01' }],
      getPiSessions: async () => [], getClaudeSessions: async () => [],
    };
    const { stdout } = await execFileAsync('tmux', ['list-panes', '-t', runtime.target, '-F', '#{pane_id}']);
    const panes = stdout.trim().split('\n');
    for (const [index, id] of ['session-left', 'session-right', 'session-left'].entries()) {
      const pane = panes[index % 2];
      await execFileAsync('tmux', ['select-pane', '-t', pane]);
      const result = await resolveCurrentTmuxSession(projectPath, deps);
      assert.equal(result.evidence?.paneId, pane);
      assert.equal(result.session?.id, id);
    }
    await execFileAsync('tmux', ['split-window', '-v', '-c', projectPath, '-t', runtime.target, 'sleep 120']);
    const empty = await resolveCurrentTmuxSession(projectPath, deps);
    assert.equal(empty.status, 'unresolved');
    assert.equal(empty.session, null);
    const disconnected = await resolveCurrentTmuxSession(projectPath, { ...deps, terminalPid: 99999999 });
    assert.equal(disconnected.status, 'unresolved');
    assert.equal(disconnected.session, null);
  } finally {
    terminal?.kill();
    await execFileAsync('tmux', ['kill-session', '-t', runtime.sessionName]).catch(() => undefined);
    await rm(projectPath, { recursive: true, force: true });
  }
});

for (const withClient of [false, true]) {
  test(`pane-scoped binding works without resume arguments, attached=${withClient}`, async () => {
    const projectPath = '/tmp/agentporch-bound-pane';
    const runtime = createTmuxTerminalRuntime(`${projectPath}_codex_route:c1`);
    const row = [runtime.sessionName, '0', 'codex_c1', '1', '0', '1', '1', '%2', '102', projectPath, 'pi', 'pi', '', '/dev/pts/2', '2', 'pi_c2'].join('\t');
    const client = ['201', '/dev/pts/3', runtime.sessionName, '0', 'codex_c1', '1', '0', '1', '%2', '102', projectPath, 'pi', 'pi', '', '/dev/pts/2', '99', '1', '2', 'pi_c2'].join('\t');
    const result = await resolveCurrentTmuxSession(projectPath, {
      getCodexSessions: () => [{ id: 'other', routeIndex: 1 }],
      getPiSessions: () => [{ id: 'pi-focused', routeIndex: 2 }], getClaudeSessions: () => [],
      readTranscriptPaths: async () => [],
      execFile: async (file, args = []) => ({ stdout: file === 'ps' ? '' : args[0] === 'list-sessions' ? runtime.sessionName : args[0] === 'list-clients' ? (withClient ? client : '') : row, stderr: '' }),
    });
    assert.equal(result.session?.id, 'pi-focused');
    assert.equal(result.provider, 'pi');
  });
}
