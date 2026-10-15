/** Exercise the actual workspace -> active tmux pane -> transcript -> same terminal loop. */
import { test, expect } from '@playwright/test';
import { execFile } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { createTmuxTerminalRuntime } from '../../backend/server/terminal-tmux-runtime';

const execute = promisify(execFile);
process.env.DATABASE_PATH = path.join(process.env.HOME || '', '.agentporch', 'auth.db');
const [{ generateToken }, { userDb }] = await Promise.all([
  import('../../backend/middleware/auth'), import('../../backend/database/db'),
]);

type TrackedWindow = Window & {
  shellSockets: WebSocket[];
  terminalElement?: Element | null;
};

for (const { viewport, sessionEntry } of [
  { viewport: { width: 1440, height: 900 }, sessionEntry: false },
  { viewport: { width: 1440, height: 900 }, sessionEntry: true },
  { viewport: { width: 390, height: 844 }, sessionEntry: false },
]) {
  test(`focused pane renders its history and returns to the same split (${viewport.width}px, ${sessionEntry ? 'session' : 'project'})`, async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript((token) => {
      localStorage.setItem('auth-token', token);
      localStorage.removeItem('activeTab');
      const win = window as unknown as TrackedWindow;
      win.shellSockets = [];
      const NativeSocket = window.WebSocket;
      window.WebSocket = class extends NativeSocket {
        constructor(url: string | URL, protocols?: string | string[]) {
          super(url, protocols);
          if (String(url).includes('/shell')) win.shellSockets.push(this);
        }
      };
    }, generateToken(userDb.getFirstUser()!));
    const projectPath = path.join(process.env.HOME!, 'workspace', 'fixture-project');
    const runtime = createTmuxTerminalRuntime(`${projectPath}_${sessionEntry ? 'codex_route:c1' : 'plain-shell_new'}`);
    const directory = await mkdtemp(path.join(tmpdir(), 'agentporch-render-switch-'));
    const cli = path.join(directory, 'codex');
    // An inert CLI process supplies real pane/process identity without starting an agent.
    await writeFile(cli, `#!${process.execPath}\nprocess.stdout.write('PANE ' + process.argv.at(-1) + '\\n'); setInterval(() => {}, 1000);\n`, { mode: 0o770 });
    try {
      if (sessionEntry) await execute('tmux', ['new-session', '-d', '-c', projectPath, '-s', runtime.sessionName, '-n', runtime.windowName, `${cli} resume fixture-project-session`]);
      await page.goto(sessionEntry ? '/workspace/fixture-project/c1' : '/workspace/fixture-project');
      await page.getByTestId('tab-shell').click();
      const terminal = page.getByTestId('persistent-main-terminal').locator('.xterm');
      await expect(terminal).toBeVisible();
      await expect.poll(async () => (await execute('tmux', ['list-panes', '-t', runtime.sessionName, '-F', '#{pane_id}']).catch(() => ({ stdout: '' }))).stdout.trim()).not.toBe('');
      // A server-side session can exist before the browser PTY has attached.
      // Wait for its client so the first prefix key cannot race attachment.
      await expect.poll(async () => (await execute('tmux', ['list-clients', '-t', runtime.sessionName, '-F', '#{client_tty}']).catch(() => ({ stdout: '' }))).stdout.trim()).not.toBe('');
      const { stdout: paneList } = await execute('tmux', ['list-panes', '-t', runtime.sessionName, '-F', '#{pane_id}']);
      const left = paneList.trim().split('\n')[0];
      if (!sessionEntry) {
        await execute('tmux', ['send-keys', '-t', left, '-l', `${cli} resume fixture-project-session`]);
        await execute('tmux', ['send-keys', '-t', left, 'Enter']);
      }
      // Keep screenshot evidence free of hostnames and real machine metadata.
      await execute('tmux', ['set-option', '-t', runtime.sessionName, 'status', 'off']);
      await execute('tmux', ['set-option', '-t', runtime.sessionName, 'prefix', 'C-b']);
      const { stdout: rightOutput } = await execute('tmux', ['split-window', '-h', '-P', '-F', '#{pane_id}', '-c', projectPath, '-t', left, `${cli} resume fixture-project-manual-session`]);
      const right = rightOutput.trim();
      await page.evaluate(() => { (window as unknown as TrackedWindow).terminalElement = document.querySelector('[data-testid="persistent-main-terminal"] .xterm'); });
      const originalSocketCount = await page.evaluate(() => (window as unknown as TrackedWindow).shellSockets.length);
      for (const [pane, expectedMessage] of [[right, 'fixture-project manual-only session'], [left, 'fixture-project session'], [right, 'fixture-project manual-only session']]) {
        const activePane = (await execute('tmux', ['display-message', '-p', '-t', runtime.sessionName, '#{pane_id}'])).stdout.trim();
        if (activePane !== pane) {
          await terminal.locator('.xterm-helper-textarea').focus();
          await page.keyboard.press('Control+b');
          await page.keyboard.press(pane === right ? 'ArrowRight' : 'ArrowLeft');
        }
        await expect.poll(async () => (await execute('tmux', ['display-message', '-p', '-t', runtime.sessionName, '#{pane_id}'])).stdout.trim()).toBe(pane);
        const { stdout: layoutBefore } = await execute('tmux', ['display-message', '-p', '-t', pane, '#{window_layout}:#{pane_id}']);
        const request = page.waitForResponse((response) => response.url().includes('/current-tmux-session'));
        await page.getByTestId('tab-chat').click();
        const response = await request;
        const resolved = await response.json();
        expect(resolved.status, JSON.stringify(resolved)).toBe('resolved');
        expect(resolved.evidence.paneId).toBe(pane);
        const transcript = page.getByTestId('chat-rendered-snapshot-pane');
        await expect(transcript).toBeVisible();
        await expect(transcript).toContainText(expectedMessage);
        if (pane === right) await page.screenshot({ path: testInfo.outputPath('focused-transcript.png') });
        await expect(terminal).toBeHidden();
        await page.getByTestId('tab-shell').click();
        await expect(terminal).toBeVisible();
        expect(await page.evaluate(() => (window as unknown as TrackedWindow).terminalElement === document.querySelector('[data-testid="persistent-main-terminal"] .xterm'))).toBe(true);
        expect(await page.evaluate(() => (window as unknown as TrackedWindow).shellSockets.length)).toBe(originalSocketCount);
        expect((await execute('tmux', ['display-message', '-p', '-t', pane, '#{window_layout}:#{pane_id}'])).stdout).toBe(layoutBefore);
        expect((await execute('tmux', ['display-message', '-p', '-t', runtime.sessionName, '#{pane_id}'])).stdout.trim()).toBe(pane);
      }
      await page.screenshot({ path: testInfo.outputPath('restored-split.png') });
      await execute('tmux', ['split-window', '-v', '-P', '-c', projectPath, '-t', right, 'sleep 120']);
      await page.getByTestId('tab-chat').click();
      await expect(page.getByRole('alert')).toContainText('No renderable session');
      await expect(terminal).toBeVisible();
      expect(errors).toEqual([]);
      await page.screenshot({ path: testInfo.outputPath(`pane-switch-${viewport.width}.png`) });
    } finally {
      await page.close();
      await execute('tmux', ['kill-session', '-t', runtime.sessionName]).catch(() => undefined);
      await rm(directory, { recursive: true, force: true });
    }
  });
}
