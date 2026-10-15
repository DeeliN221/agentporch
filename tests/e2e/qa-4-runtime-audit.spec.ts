/** Audit the current Pi terminal entry and reload on desktop and mobile. */
import { test, expect } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createTmuxTerminalRuntime } from '../../backend/server/terminal-tmux-runtime';
import { openFixtureProject, PRIMARY_FIXTURE_PROJECT_PATH } from '../spec/helpers/spec-test-helpers.ts';

const execute = promisify(execFile);
for (const width of [1440, 390]) {
  test(`Pi terminal runtime stays usable after reload (${width}px)`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await openFixtureProject(page);
    const runtimeErrors: string[] = [];
    const serverErrors: string[] = [];
    page.on('pageerror', (error) => runtimeErrors.push(error.message));
    page.on('response', (response) => {
      if (response.url().includes('/api/') && response.status() >= 500) serverErrors.push(`${response.status()} ${response.url()}`);
    });
    await page.getByTestId('project-new-session-button').click();
    await page.getByTestId('project-new-session-provider-pi').click();
    await expect(page).toHaveURL(/\/c\d+\?tab=shell&provider=pi$/);
    const route = new URL(page.url()).pathname.split('/').at(-1);
    const runtime = createTmuxTerminalRuntime(`${PRIMARY_FIXTURE_PROJECT_PATH}_pi_route:${route}`);
    try {
      for (const reload of [false, true]) {
        if (reload) await page.reload({ waitUntil: 'networkidle' });
        await expect(page.getByTestId('tab-shell')).toHaveAttribute('aria-pressed', 'true');
        await expect(page.locator('.xterm')).toBeVisible();
        await expect(page.locator('.xterm-helper-textarea')).toBeAttached();
        await expect(page.getByTestId('session-model-select')).toHaveCount(0);
        await expect(page.getByTestId('session-depth-select')).toHaveCount(0);
        if (width === 390) await expect(page.getByTestId('shell-mobile-keybar')).toBeVisible();
      }
      await page.screenshot({ path: testInfo.outputPath('terminal-after-reload.png'), fullPage: true });
      expect(runtimeErrors).toEqual([]);
      expect(serverErrors).toEqual([]);
    } finally {
      await page.close();
      await execute('tmux', ['kill-window', '-t', runtime.target]).catch(() => undefined);
    }
  });
}
