/** Switching an advanced terminal no longer resolves or replaces the selected chat. */
import { test, expect } from '@playwright/test';
import { authenticatePage, getFixtureProject } from '../spec/helpers/spec-test-helpers.ts';
import { buildProjectRoute } from '../../frontend/utils/projectRoute.ts';

test('returning from an unrelated terminal preserves the chat route and draft', async ({ page }) => {
  const paneRequests: string[] = [];
  page.on('request', request => { if (request.url().includes('/current-tmux-session')) paneRequests.push(request.url()); });
  await page.routeWebSocket('**/shell**', socket => socket.onMessage(data => {
    if (JSON.parse(String(data)).type === 'init') {
      socket.send(JSON.stringify({ type: 'terminal-attached', ptyPid: 99999999 }));
      socket.send(JSON.stringify({ type: 'output', data: 'Independent project terminal\r\n' }));
    }
  }));
  await authenticatePage(page);
  const project = await getFixtureProject(page.request);
  await page.goto(`${buildProjectRoute(project)}/c3?tab=chat`);
  const chat = page.getByTestId('web-chat');
  await expect(chat).toBeVisible();
  const identity = await chat.getAttribute('data-session-id');
  const input = page.locator('textarea.chat-input-placeholder');
  await input.fill('Keep this conversation selected');
  for (let i = 0; i < 3; i++) {
    await page.getByTestId('tab-shell').click();
    await expect(page.locator('.xterm')).toBeVisible();
    await page.getByTestId('tab-chat').click();
    await expect(chat).toHaveAttribute('data-session-id', identity!);
    await expect(input).toHaveValue('Keep this conversation selected');
  }
  expect(paneRequests).toEqual([]);
  await expect(page.getByRole('alert')).toHaveCount(0);
});
