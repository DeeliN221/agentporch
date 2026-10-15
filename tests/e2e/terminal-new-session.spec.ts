/** Exercise new-session input through the real browser, PTY, and tmux relay. */
import { test, expect } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createTmuxTerminalRuntime } from '../../backend/server/terminal-tmux-runtime';
import { openFixtureProject, PRIMARY_FIXTURE_PROJECT_PATH } from '../spec/helpers/spec-test-helpers';

const execute = promisify(execFile);

for (const { provider, width } of [{ provider: 'pi', width: 1440 }, { provider: 'pi', width: 390 }]) {
  test(`new ${provider} session opens Terminal and relays input once (${width}px)`, async ({ page }) => {
    await openFixtureProject(page);
    await page.setViewportSize({ width, height: 900 });
    await page.getByTestId('project-new-session-button').click();
    await page.getByTestId(`project-new-session-provider-${provider}`).click();
    await expect(page).toHaveURL(/\/c\d+\?.*tab=shell/);
    await expect(page.getByTestId('tab-shell')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('chat-rendered-snapshot-pane')).toHaveCount(0);

    const route = new URL(page.url()).pathname.split('/').at(-1)!;
    const runtime = createTmuxTerminalRuntime(`${PRIMARY_FIXTURE_PROJECT_PATH}_${provider}_route:${route}`);
    const readPane = async () => (await execute('tmux', ['capture-pane', '-p', '-t', runtime.target])
      .catch(() => ({ stdout: '' }))).stdout;
    try {
      await expect.poll(readPane).toContain('Fixture agent terminal ready');
      const input = page.getByTestId('persistent-main-terminal').locator('.xterm-helper-textarea');
      await input.focus();
      await page.keyboard.type('sample terminal input');
      await page.keyboard.press('Enter');
      await expect.poll(async () => (await readPane()).split('Fixture received: sample terminal input').length - 1).toBe(1);
      await page.reload({ waitUntil: 'networkidle' });
      await expect(page.getByTestId('tab-shell')).toHaveAttribute('aria-pressed', 'true');
      await expect.poll(readPane).toContain('Fixture received: sample terminal input');
    } finally {
      await execute('tmux', ['kill-window', '-t', runtime.target]).catch(() => undefined);
    }
  });
}
