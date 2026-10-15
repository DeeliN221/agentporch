/** Follow-up text belongs to the provider terminal; the browser relays it without classifying CLI turns. */
import { test, expect } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createTmuxTerminalRuntime } from '../../backend/server/terminal-tmux-runtime';
import { openFixtureProject, PRIMARY_FIXTURE_PROJECT_PATH } from '../spec/helpers/spec-test-helpers.ts';

const execute = promisify(execFile);
for (const rapid of [false, true]) {
  test(`Pi terminal preserves ${rapid ? 'rapid consecutive' : 'idle follow-up'} inputs across reload`, async ({ page }) => {
    await openFixtureProject(page);
    await page.getByTestId('project-new-session-button').click();
    await page.getByTestId('project-new-session-provider-pi').click();
    await expect(page).toHaveURL(/\/c\d+\?tab=shell&provider=pi$/);
    const route = new URL(page.url()).pathname.split('/').at(-1);
    const runtime = createTmuxTerminalRuntime(`${PRIMARY_FIXTURE_PROJECT_PATH}_pi_route:${route}`);
    const readPane = async () => (await execute('tmux', ['capture-pane', '-p', '-t', runtime.target]).catch(() => ({ stdout: '' }))).stdout;
    const prompts = ['first terminal request', 'follow-up terminal request', 'final terminal request'];
    try {
      await expect.poll(readPane).toContain('Fixture agent terminal ready');
      const input = page.locator('.xterm-helper-textarea');
      for (const prompt of prompts) {
        await input.pressSequentially(prompt);
        await input.press('Enter');
        if (!rapid) await expect.poll(readPane).toContain(`Fixture received: ${prompt}`);
      }
      // One terminal echo plus one CLI receipt for each submitted line.
      await expect.poll(async () => {
        const output = await readPane();
        return prompts.map(prompt => output.split(prompt).length - 1);
      }).toEqual([2, 2, 2]);
      const assertInputs = async () => {
        const output = await readPane();
        // The fake CLI may receive several newline-delimited inputs in one chunk.
        for (const prompt of prompts) {
          expect(output).toContain(prompt);
        }
        const positions = prompts.map(prompt => output.lastIndexOf(prompt));
        expect(positions).toEqual([...positions].sort((a, b) => a - b));
        return output;
      };
      const beforeReload = await assertInputs();
      await page.reload({ waitUntil: 'networkidle' });
      await expect(page.locator('.xterm')).toBeVisible();
      await assertInputs();
      for (const prompt of prompts) {
        expect((await readPane()).split(prompt).length).toBe(beforeReload.split(prompt).length);
      }
      await expect(page.locator('textarea.chat-input-placeholder')).toHaveCount(0);
    } finally {
      await page.close();
      await execute('tmux', ['kill-window', '-t', runtime.target]).catch(() => undefined);
    }
  });
}
