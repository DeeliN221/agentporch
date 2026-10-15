/** History is read-only until the user explicitly opens the provider terminal. */
import { test, expect } from '@playwright/test';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createTmuxTerminalRuntime } from '../../backend/server/terminal-tmux-runtime';
import { authenticatePage, PRIMARY_FIXTURE_PROJECT_PATH } from '../spec/helpers/spec-test-helpers';
import { PLAYWRIGHT_FIXTURE_HOME } from './helpers/playwright-fixture';

const execute = promisify(execFile);

for (const width of [1440, 390]) {
  test(`Pi history opens readonly and resumes the same session only in Terminal (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await authenticatePage(page);
    const sessionId = `pi-history-resume-${width}`;
    const sessionPath = path.join(PLAYWRIGHT_FIXTURE_HOME, '.pi', 'agent', 'sessions', `${sessionId}.jsonl`);
    await fs.mkdir(path.dirname(sessionPath), { recursive: true });
    const entries = [
      { type: 'session', version: 3, id: sessionId, cwd: PRIMARY_FIXTURE_PROJECT_PATH },
      { type: 'message', message: { role: 'user', content: [{ type: 'text', text: 'Existing saved request' }] } },
      { type: 'message', message: { role: 'assistant', content: [{ type: 'text', text: 'Existing saved answer' }] } },
    ];
    const saved = entries.map((entry) => JSON.stringify(entry)).join('\n') + '\n';
    await fs.writeFile(sessionPath, saved);
    const shellInits: Array<{ routeSessionId?: string; providerSessionId: string; hasSession: boolean }> = [];
    page.on('websocket', (socket) => {
      if (!new URL(socket.url()).pathname.startsWith('/shell')) return;
      socket.on('framesent', ({ payload }) => {
        try {
          const message = JSON.parse(String(payload));
          if (message.type === 'init') shellInits.push(message);
        } catch { /* Ignore terminal binary data. */ }
      });
    });
    const query = new URLSearchParams({ provider: 'pi', projectPath: PRIMARY_FIXTURE_PROJECT_PATH });
    await page.goto(`/session/${sessionId}?${query}`, { waitUntil: 'networkidle' });
    const history = page.getByTestId('chat-rendered-snapshot-pane');
    await expect(history).toContainText('Existing saved answer');
    await expect(history.locator('textarea, [contenteditable="true"]')).toHaveCount(0);
    expect(shellInits).toEqual([]);
    await page.reload({ waitUntil: 'networkidle' });
    await expect(history).toContainText('Existing saved answer');
    expect(shellInits).toEqual([]);

    await page.getByTestId('tab-shell').click();
    await expect.poll(() => shellInits.length).toBeGreaterThan(0);
    // The isolated CLI has no credentials; exercise the explicit confirmation before using it.
    await page.getByRole('button', { name: 'Continue at your own risk', exact: true }).click();
    const init = shellInits[0];
    expect(init.providerSessionId).toBe(sessionId);
    expect(init.hasSession).toBe(true);
    const identity = init.routeSessionId ? `route:${init.routeSessionId}` : `provider:${sessionId}`;
    const runtime = createTmuxTerminalRuntime(`${PRIMARY_FIXTURE_PROJECT_PATH}_pi_${identity}`);
    const readPane = async () => (await execute('tmux', ['capture-pane', '-p', '-t', runtime.target]).catch(() => ({ stdout: '' }))).stdout;
    try {
      await expect.poll(readPane).toContain('Fixture agent terminal ready');
      await page.getByTestId('persistent-main-terminal').locator('.xterm-helper-textarea').focus();
      await page.keyboard.type('continue saved session');
      await page.keyboard.press('Enter');
      await expect.poll(readPane).toContain('Fixture received: continue saved session');
      await page.getByTestId('tab-chat').click();
      await expect(history).toContainText('Existing saved answer');
      await expect(history.locator('textarea')).toHaveCount(0);
      expect(await fs.readFile(sessionPath, 'utf8')).toBe(saved);
    } finally {
      await execute('tmux', ['kill-window', '-t', runtime.target]).catch(() => undefined);
    }
  });
}
