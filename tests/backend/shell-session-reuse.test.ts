/**
 * Purpose: reuse the existing route-numbered terminal when the homepage supplies only the real session ID.
 * Page entry points and service restarts must not create a second terminal window for the same conversation.
 */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { saveProjectConfig } from '../../backend/domains/projects/project-config-read-model.ts';
import { getProjectLocalConfigPath } from '../../backend/project-config-store.ts';
import { closeShellPtySessions, handleShellConnection } from '../../backend/server/shell-websocket.ts';
import { createTmuxTerminalRuntime } from '../../backend/server/terminal-tmux-runtime.ts';

const execFileAsync = promisify(execFile);

for (const provider of ['codex', 'pi', 'claude'] as const) {
  for (const storedField of ['sessionId', 'providerSessionId']) {
    test(`${provider} homepage entry recovers the original window through ${storedField} across repeated visits and restarts`, async (t) => {
      /** Verify identity lookup with real project bindings and tmux windows; the terminal double only records its connection target. */
      if (process.platform === 'win32') return t.skip('tmux lifecycle is POSIX-only');
      try {
        await execFileAsync('tmux', ['-V']);
      } catch {
        return t.skip('tmux is not installed');
      }
      const projectPath = await mkdtemp(path.join(tmpdir(), 'agentporch-route-reuse-'));
      const providerSessionId = 'existing-conversation-123';
      const routeKey = `${projectPath}_${provider}_route:c71`;
      const runtime = createTmuxTerminalRuntime(routeKey);
      const ptySessionsMap = new Map();
      let spawnCount = 0;
      let launchedCommand = '';
      const fakePty = {
        pid: 99,
        write() { /** This scenario sends no input to the user conversation. */ },
        resize() { /** Identity matching does not depend on terminal size. */ },
        kill() { /** The test cleans up its own tmux window separately. */ },
        onData() { /** Verify window contents with real tmux capture rather than simulated output. */ },
        onExit() { /** Keep the forwarding-process double alive until the scenario ends. */ },
      };
      const deps = {
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
          /** Record launch commands so a failing case cannot start another external assistant. */
          spawnCount += 1;
          launchedCommand = args[1];
          return fakePty;
        } }),
      };
      const connect = async () => {
        /** Simulate homepage entry with the real session ID and explicitly omit the route number. */
        const handlers = new Map<string, (...args: any[]) => any>();
        handleShellConnection(deps, {
          readyState: 1,
          on(event: string, handler: (...args: any[]) => any) {
            /** Send initialization through the production connection handler. */
            handlers.set(event, handler);
          },
          send() { /** Assert backend window bindings independently of welcome text. */ },
        } as any);
        await handlers.get('message')?.(JSON.stringify({
          type: 'init', provider, projectPath, providerSessionId, riskConfirmed: true,
        }));
      };
      try {
        await saveProjectConfig({ chat: { '71': { provider, [storedField]: providerSessionId } } }, projectPath);
        await execFileAsync('tmux', runtime.createSession('sleep 120').slice(1));
        await connect();
        assert.equal(ptySessionsMap.get(routeKey)?.tmuxTarget, runtime.target);
        assert.ok(launchedCommand.includes(`tmux attach-session -t '${runtime.target}'`));
        await connect();
        assert.equal(spawnCount, 1, 'The existing forwarding connection must also be reused');
        ptySessionsMap.clear();
        await connect();
        assert.equal(ptySessionsMap.get(routeKey)?.tmuxTarget, runtime.target, 'Reuse the persisted binding when in-memory state is absent');
        assert.equal(spawnCount, 2);
        const windows = await execFileAsync('tmux', ['list-windows', '-t', runtime.sessionName, '-F', '#{window_name}']);
        assert.deepEqual(windows.stdout.trim().split('\n'), [runtime.windowName]);
      } finally {
        closeShellPtySessions(deps);
        await execFileAsync('tmux', ['kill-session', '-t', runtime.sessionName]).catch(() => undefined);
        await rm(path.dirname(getProjectLocalConfigPath(projectPath)), { recursive: true, force: true });
        await rm(projectPath, { recursive: true, force: true });
      }
    });
  }
}
