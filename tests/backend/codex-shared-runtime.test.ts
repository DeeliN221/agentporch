/**
 * Purpose: regress client capabilities and safe takeover when connecting to the standalone Codex system service.
 */

import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  clearCodexCapabilityProbeCacheForTest,
  parseCodexSharedRuntimeCapabilities,
  probeCodexSharedRuntimeCapabilities,
} from '../../backend/domains/codex-app-server/capability-probe.ts';
import { resolveSharedCodexRuntimePlan } from '../../backend/domains/codex-app-server/shared-runtime-plan.ts';
import { resolveCodexTerminalAttachPlan } from '../../backend/server/codex-terminal-attach-plan.ts';
import { CodexAppServerSessionManager } from '../../backend/domains/codex-app-server/session-manager.ts';

/** Create a fake Codex command with controlled delays and failures to test asynchronous probing with real subprocesses. */
async function createFakeCapabilityCommand(): Promise<{
  command: string;
  directory: string;
  failureMarker: string;
  logPath: string;
}> {
  /** The fake command logs each help invocation and reads its delay from the environment. */
  const directory = await mkdtemp(path.join(tmpdir(), 'agentporch-codex-probe-'));
  const command = path.join(directory, 'fake-codex.mjs');
  const failureMarker = path.join(directory, 'fail');
  const logPath = path.join(directory, 'calls.log');
  await writeFile(command, `#!/usr/bin/env node
import { appendFileSync, existsSync } from 'node:fs';
const args = process.argv.slice(2);
appendFileSync(process.env.PROBE_LOG, JSON.stringify(args) + '\\n');
setTimeout(() => {
  if (process.env.PROBE_FAILURE_MARKER && existsSync(process.env.PROBE_FAILURE_MARKER)) {
    process.stderr.write('controlled probe failure');
    process.exit(9);
  }
  if (args[0] === 'app-server') {
    process.stdout.write('Usage: codex app-server proxy --sock <PATH> Unix domain socket');
  } else {
    process.stdout.write('Usage: codex --remote unix://PATH');
  }
}, Number(process.env.PROBE_DELAY_MS || 0));
`, { mode: 0o755 });
  return { command, directory, failureMarker, logPath };
}

/** Count fake-command invocations, treating an empty log as zero calls. */
async function countProbeCalls(logPath: string): Promise<number> {
  /** Each line represents one real execFile invocation. */
  const content = await readFile(logPath, 'utf8').catch(() => '');
  return content.trim() ? content.trim().split('\n').length : 0;
}

test('capability probing uses the help contract rather than the version number', () => {
  /** Simulate CLI help for a client supporting the shared runtime. */
  const capabilities = parseCodexSharedRuntimeCapabilities({
    proxyHelp: 'Usage: codex app-server proxy\n--sock <SOCKET_PATH> Unix domain socket',
    rootHelp: '--remote <ADDR> Accepted forms: unix://PATH',
  });
  assert.deepEqual(capabilities, { proxy: true, unixSocket: true, remoteTui: true });
});

test('asynchronous probing deduplicates concurrent calls, caches success, and leaves the event loop responsive', async (t) => {
  /** Two concurrent callers should launch only the proxy and root help subprocesses. */
  const fixture = await createFakeCapabilityCommand();
  t.after(async () => {
    clearCodexCapabilityProbeCacheForTest(fixture.command);
    await rm(fixture.directory, { recursive: true, force: true });
  });
  const options = {
    ttlMs: 60_000,
    timeoutMs: 1000,
    env: {
      ...process.env,
      PROBE_DELAY_MS: '100',
      PROBE_LOG: fixture.logPath,
    },
  };

  let timerObserved = false;
  const first = probeCodexSharedRuntimeCapabilities(fixture.command, options);
  const second = probeCodexSharedRuntimeCapabilities(fixture.command, options);
  await new Promise<void>((resolve) => setTimeout(() => {
    timerObserved = true;
    resolve();
  }, 10));
  assert.equal(timerObserved, true, 'event loop timer must run while help commands are pending');

  const [firstResult, secondResult] = await Promise.all([first, second]);
  assert.deepEqual(firstResult, { proxy: true, unixSocket: true, remoteTui: true });
  assert.deepEqual(secondResult, firstResult);
  assert.equal(await countProbeCalls(fixture.logPath), 2);

  await probeCodexSharedRuntimeCapabilities(fixture.command, options);
  assert.equal(await countProbeCalls(fixture.logPath), 2, 'successful result must be served from cache');
});

test('failed capability probes are not cached and can be retried', async (t) => {
  /** Remove the marker after the controlled first failure; the retry must rerun both help commands successfully. */
  const fixture = await createFakeCapabilityCommand();
  t.after(async () => {
    clearCodexCapabilityProbeCacheForTest(fixture.command);
    await rm(fixture.directory, { recursive: true, force: true });
  });
  await writeFile(fixture.failureMarker, 'fail');
  const options = {
    ttlMs: 60_000,
    timeoutMs: 1000,
    env: {
      ...process.env,
      PROBE_FAILURE_MARKER: fixture.failureMarker,
      PROBE_LOG: fixture.logPath,
    },
  };

  await assert.rejects(
    probeCodexSharedRuntimeCapabilities(fixture.command, options),
    /Codex capability probe failed/,
  );
  assert.equal(await countProbeCalls(fixture.logPath), 2);

  await unlink(fixture.failureMarker);
  const recovered = await probeCodexSharedRuntimeCapabilities(fixture.command, options);
  assert.deepEqual(recovered, { proxy: true, unixSocket: true, remoteTui: true });
  assert.equal(await countProbeCalls(fixture.logPath), 4, 'failed result must not suppress retry');
});

test('missing capabilities never silently select a private stdio runtime', () => {
  /** Fallback requires explicit caller authorization; the connection plan itself must remain safe. */
  const plan = resolveSharedCodexRuntimePlan({
    codexHome: '/tmp/codex-home',
    capabilities: { proxy: false, unixSocket: true, remoteTui: true },
    socketReady: false,
  });
  assert.equal(plan.mode, 'unsupported');
});

test('unknown external sessions are not described as lossless takeovers', () => {
  /** Keep terminal takeover conservative when the standalone service cannot be reached. */
  const attach = resolveCodexTerminalAttachPlan({
    providerSessionId: 'thread-unknown',
    managedTmuxExists: false,
    sharedRuntime: { ready: false, endpoint: null },
    externalSessionState: 'unknown',
  });
  assert.equal(attach.action, 'blocked');
  assert.equal(attach.mayInterruptActiveTurn, false);
});

test('a running daemon does not prove an old active thread belongs to the shared runtime', () => {
  /** Block remote takeover without evidence that the target thread is loaded or active in the shared runtime. */
  const attach = resolveCodexTerminalAttachPlan({
    providerSessionId: 'legacy-active',
    managedTmuxExists: false,
    sharedRuntime: {
      ready: true,
      endpoint: 'unix:///tmp/live.sock',
      threadOwned: false,
      activeTurnOwned: false,
    },
    externalSessionState: 'running',
  });
  assert.equal(attach.action, 'blocked');
  assert.equal(attach.commandArgs, null);
});

test('readable unloaded idle historical threads migrate into the shared runtime', () => {
  /** Once history confirms no active turn, enter the shared daemon through the remote TUI rather than reporting activity. */
  const attach = resolveCodexTerminalAttachPlan({
    providerSessionId: 'legacy-idle-thread',
    managedTmuxExists: false,
    sharedRuntime: {
      ready: true,
      endpoint: 'unix:///tmp/live.sock',
      threadOwned: false,
      threadReadable: true,
      threadState: 'idle',
      activeTurnDetected: false,
      activeTurnOwned: false,
    },
    externalSessionState: 'unknown',
  });
  assert.equal(attach.action, 'remote-tui');
  assert.deepEqual(attach.commandArgs, ['--remote', 'unix:///tmp/live.sock', 'resume', 'legacy-idle-thread']);
  assert.equal(attach.reason, 'historical-idle-thread-migrated');
});

test('readable unloaded active historical threads remain blocked', () => {
  /** Readable history proves only existence; never automatically resume an active turn outside the shared daemon. */
  const attach = resolveCodexTerminalAttachPlan({
    providerSessionId: 'legacy-active-thread',
    managedTmuxExists: false,
    sharedRuntime: {
      ready: true,
      endpoint: 'unix:///tmp/live.sock',
      threadOwned: false,
      threadReadable: true,
      threadState: 'active',
      activeTurnDetected: true,
      activeTurnOwned: false,
    },
    externalSessionState: 'unknown',
  });
  assert.equal(attach.action, 'blocked');
  assert.equal(attach.reason, 'external-active-session-not-shared');
  assert.equal(attach.commandArgs, null);
});

test('explicit user confirmation creates a shared session from the same card', () => {
  /** Forced takeover preserves the old process and routes the new shared thread through the same cN route. */
  const attach = resolveCodexTerminalAttachPlan({
    providerSessionId: 'legacy-active-thread',
    managedTmuxExists: false,
    forceHandoff: true,
    sharedRuntime: {
      ready: true,
      endpoint: 'unix:///tmp/live.sock',
      threadOwned: false,
      threadReadable: true,
      threadState: 'active',
      activeTurnDetected: true,
      activeTurnOwned: false,
    },
    externalSessionState: 'running',
  });
  assert.equal(attach.action, 'new-shared-tui');
  assert.equal(attach.commandArgs, null);
  assert.equal(attach.reason, 'user-forced-legacy-handoff');
  assert.equal(attach.mayInterruptActiveTurn, false);
});

test('forced takeover remains blocked when the shared daemon is unavailable', () => {
  /** Without a shared endpoint, never misrepresent ordinary codex resume as a new shared session. */
  const attach = resolveCodexTerminalAttachPlan({
    providerSessionId: 'legacy-active-thread',
    managedTmuxExists: false,
    forceHandoff: true,
    sharedRuntime: { ready: false, endpoint: null },
    externalSessionState: 'running',
  });
  assert.equal(attach.action, 'blocked');
  assert.equal(attach.commandArgs, null);
});

test('readable daemon history with an unfinished final turn remains blocked as unknown', () => {
  /** A private runtime can appear interrupted without a completion time; do not assume it is idle. */
  const attach = resolveCodexTerminalAttachPlan({
    providerSessionId: 'legacy-unsettled-thread',
    managedTmuxExists: false,
    sharedRuntime: {
      ready: true,
      endpoint: 'unix:///tmp/live.sock',
      threadOwned: false,
      threadReadable: true,
      threadState: 'unknown',
      activeTurnDetected: false,
      activeTurnOwned: false,
    },
    externalSessionState: 'unknown',
  });
  assert.equal(attach.action, 'blocked');
  assert.equal(attach.reason, 'shared-thread-state-unavailable');
});

test('threads claimed by the shared daemon can reconnect safely when refreshed status is unknown', () => {
  /** Browser refresh loses transient processing state; daemon thread ownership is the backend source of truth. */
  const attach = resolveCodexTerminalAttachPlan({
    providerSessionId: 'shared-idle-thread',
    managedTmuxExists: false,
    sharedRuntime: {
      ready: true,
      endpoint: 'unix:///tmp/live.sock',
      threadOwned: true,
      activeTurnOwned: false,
    },
    externalSessionState: 'unknown',
  });
  assert.equal(attach.action, 'remote-tui');
  assert.deepEqual(attach.commandArgs, ['--remote', 'unix:///tmp/live.sock', 'resume', 'shared-idle-thread']);
});

test('proxy disconnect preserves active turns and allows resubscription', () => {
  /** A client connection failure must not masquerade as a daemon turn failure. */
  const events: Array<Record<string, unknown>> = [];
  const manager = new CodexAppServerSessionManager();
  const session = manager.getOrCreateSession('c1', '/tmp/project', {
    send: (event) => events.push(event as Record<string, unknown>),
  });
  session.providerThreadId = 'thread-live';
  session.activeTurnId = 'turn-live';
  session.status = 'running';
  session.notificationSubscribed = true;

  manager.markTransportDisconnected('proxy closed');

  assert.equal(session.status, 'running');
  assert.equal(session.activeTurnId, 'turn-live');
  assert.equal(session.notificationSubscribed, false);
  assert.equal(events[0]?.type, 'codex-connection-lost');
  assert.equal(events[0]?.activeTurnPreserved, true);
});
