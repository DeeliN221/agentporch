/** Verify PTY line feeds and real tmux pane isolation with the production xterm options. */
import { test, expect, type Page } from '@playwright/test';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type { Terminal } from '@xterm/xterm';
import { refreshTerminalClient } from '../../backend/server/terminal-processes';
import { TERMINAL_OPTIONS } from '../../frontend/components/shell/constants/constants';

const require = createRequire(import.meta.url);
const execFileAsync = promisify(execFile);
type TerminalWindow = Window & { Terminal: typeof Terminal; terminal: Terminal };
const browserErrors = new WeakMap<Page, string[]>();

async function writeOutput(page: Page, output: string) {
  await page.evaluate((data) => new Promise<void>((resolve) => {
    (window as unknown as TerminalWindow).terminal.write(data, resolve);
  }), output);
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  browserErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.route('http://localhost/terminal-rendering-test', (route) => route.fulfill({
    contentType: 'text/html',
    body: '<title>AgentPorch terminal rendering test</title><div id="terminal"></div>',
  }));
  await page.goto('http://localhost/terminal-rendering-test');
  await expect(page).toHaveTitle('AgentPorch terminal rendering test');
  await page.addStyleTag({ path: require.resolve('@xterm/xterm/css/xterm.css') });
  await page.addScriptTag({ path: require.resolve('@xterm/xterm') });
  await page.evaluate((options) => {
    const win = window as unknown as TerminalWindow;
    win.terminal = new win.Terminal({ ...options, cols: 120, rows: 36 });
    win.terminal.open(document.getElementById('terminal')!);
  }, TERMINAL_OPTIONS);
  await expect(page.locator('.xterm')).toBeVisible();
});

test.afterEach(async ({ page }) => {
  expect(browserErrors.get(page)).toEqual([]);
});

test('PTY LF preserves the column while CRLF starts at column zero', async ({ page }) => {
  await writeOutput(page, '\x1b[1;61HRIGHT\x1b[61G\nNEXT');
  expect(await page.evaluate(() => {
    const buffer = (window as unknown as TerminalWindow).terminal.buffer.active;
    return buffer.getLine(1)!.translateToString(true);
  })).toBe(`${' '.repeat(60)}NEXT`);
  await writeOutput(page, '\r\nSHELL');
  expect(await page.evaluate(() => {
    return (window as unknown as TerminalWindow).terminal.buffer.active.getLine(2)!.translateToString(true);
  })).toBe('SHELL');
});

for (const direction of ['-h', '-v']) {
  test(`tmux ${direction} keeps both panes intact during output and scrolling`, async ({ page }, testInfo) => {
    test.skip(process.platform === 'win32', 'tmux requires a POSIX host');
    const pty = await import('node-pty');
    const directory = await mkdtemp(path.join(tmpdir(), 'agentporch-render-'));
    const socket = path.join(directory, 'tmux.sock');
    const args = ['-S', socket, '-f', '/dev/null'];
    const tmux = (...command: string[]) => execFileAsync('tmux', [...args, ...command]);
    const env: NodeJS.ProcessEnv = { ...process.env, TERM: 'xterm-256color', PS1: '$ ' };
    delete env.TMUX;
    const terminal = pty.spawn('tmux', [...args, 'new-session', '-s', 'render', '/bin/sh'], {
      name: 'xterm-256color', cols: 120, rows: 36, env,
    });
    let pending = '';
    terminal.onData((data) => { pending += data; });
    await page.exposeFunction('sendTerminalInput', (data: string) => terminal.write(data));
    await page.evaluate(() => {
      (window as unknown as TerminalWindow).terminal.onData((data) => {
        void (window as unknown as { sendTerminalInput: (data: string) => Promise<void> }).sendTerminalInput(data);
      });
    });
    const drain = async () => {
      const output = pending;
      pending = '';
      if (output) await writeOutput(page, output);
    };
    try {
      await expect.poll(async () => {
        await drain();
        return tmux('has-session', '-t', 'render').then(() => true, () => false);
      }).toBe(true);
      await tmux('set-option', '-t', 'render', 'status', 'off');
      await tmux('split-window', direction, '-t', 'render', '/bin/sh');
      const { stdout } = await tmux('list-panes', '-t', 'render', '-F', '#{pane_id} #{pane_left} #{pane_top} #{pane_width} #{pane_height}');
      const panes = stdout.trim().split('\n').map((line) => {
        const [id, ...geometry] = line.split(' ');
        const [left, top, width, height] = geometry.map(Number);
        return { id, left, top, width, height };
      });
      for (const [index, pane] of panes.entries()) {
        await tmux('send-keys', '-t', pane.id, '-l', String.raw`stty -echo; printf '\033[2J\033[H'; i=1; while [ "$i" -le 80 ]; do printf 'PANE${index}-%03d\n' "$i"; i=$((i+1)); sleep 0.01; done; printf '\033[2;10Habcde\033[3;15Hfghij\033[4;20Hklmno'; sleep 0.1`);
        await tmux('send-keys', '-t', pane.id, 'Enter');
      }
      for (const [index, pane] of panes.entries()) {
        await expect.poll(async () => {
          await drain();
          return (await tmux('capture-pane', '-p', '-t', pane.id)).stdout;
        }).toContain(`PANE${index}-080`);
      }
      for (const phase of ['live', 'reconnect']) {
        if (phase === 'reconnect') {
          await writeOutput(page, '\x1b[2J\x1b[H');
          expect(await refreshTerminalClient(terminal.pid, async (file, command = [], options) => {
            return execFileAsync(file, file === 'tmux' ? [...args, ...command] : [...command], { ...options, encoding: 'utf8' });
          })).toBe(true);
        }
        for (const pane of panes) {
          await expect(async () => {
            await drain();
            const expected = (await tmux('capture-pane', '-p', '-t', pane.id)).stdout.replace(/\n$/, '').split('\n').map((line) => line.trimEnd());
            const actual = await page.evaluate(({ left, top, width, height }) => {
              const buffer = (window as unknown as TerminalWindow).terminal.buffer.active;
              return Array.from({ length: height }, (_, row) => buffer.getLine(buffer.viewportY + top + row)!.translateToString(true, left, left + width).trimEnd());
            }, pane);
            expect(actual).toEqual(expected);
          }).toPass({ timeout: 7_000 });
        }
      }
      await page.screenshot({ path: testInfo.outputPath(`tmux-${direction.slice(1)}.png`) });
    } finally {
      terminal.kill();
      await tmux('kill-server').catch(() => undefined);
      await rm(directory, { recursive: true, force: true });
    }
  });
}
