/** Web chat owns session identity; a separately opened terminal cannot redirect it. */
import { test, expect } from '@playwright/test';
import { authenticatePage, getFixtureProject } from '../spec/helpers/spec-test-helpers.ts';
import { buildProjectRoute } from '../../frontend/utils/projectRoute.ts';

for (const mobile of [false, true]) {
  test(`web chat, uploads and independent terminal (${mobile ? 'mobile' : 'desktop'})`, async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 });
    const paneRequests: string[] = [];
    const shellMessages: any[] = [];
    page.on('request', request => { if (request.url().includes('current-tmux-session')) paneRequests.push(request.url()); });
    await page.routeWebSocket('**/shell**', socket => {
      socket.onMessage(data => {
        const message = JSON.parse(String(data)); shellMessages.push(message);
        if (message.type === 'init') {
          socket.send(JSON.stringify({ type: 'output', data: 'Advanced terminal ready\r\n' }));
          socket.send(JSON.stringify({ type: 'terminal-attached', ptyPid: 99999999 }));
        }
      });
    });
    await page.route('**/api/diagnostics/runtime-dependencies', async route => {
      const response = await route.fetch(); const payload = await response.json();
      payload.capabilities = { ...payload.capabilities, manualSessions: ['pi', 'codex'] };
      await route.fulfill({ response, json: payload });
    });
    await authenticatePage(page);
    const project = await getFixtureProject(page.request);
    await page.goto(buildProjectRoute(project));
    await expect(page.getByTestId('project-new-session-button')).toBeVisible({ timeout: 60_000 });
    await page.getByTestId('project-new-session-button').click();
    await page.getByTestId('project-new-session-provider-pi').click();
    await expect(page).toHaveURL(/tab=chat/);
    await expect(page.getByTestId('web-chat')).toBeVisible({ timeout: 60_000 });
    const input = page.locator('textarea.chat-input-placeholder');
    await expect(input).toBeVisible();
    expect(shellMessages).toEqual([]);
    await input.fill('Please review the attached notes.');
    const fileInput = page.locator('input[type=file]:not([webkitdirectory])').first();
    await fileInput.setInputFiles({ name: 'review-notes.txt', mimeType: 'text/plain', buffer: Buffer.from('Review the upload flow.') });
    await expect(page.getByText('review-notes.txt').first()).toBeVisible();
    const sessionId = await page.getByTestId('web-chat').getAttribute('data-session-id');
    await page.getByTestId('tab-shell').click();
    await expect(page.locator('.xterm').first()).toBeVisible();
    await page.getByTestId('tab-chat').click();
    await expect(page.getByTestId('web-chat')).toHaveAttribute('data-session-id', sessionId!);
    await expect(input).toHaveValue('Please review the attached notes.');
    await expect(page.getByText('review-notes.txt').first()).toBeVisible();
    expect(paneRequests).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`web-chat-${mobile ? 'mobile' : 'desktop'}.png`) });
    const upload = page.waitForResponse(response => response.url().includes('/upload-attachments'));
    await page.locator('form button[type=submit]').last().click();
    expect((await upload).ok()).toBeTruthy();
    await expect(input).toHaveValue('');
    await expect(page.getByTestId('web-chat')).toContainText('Please review the attached notes.');
    await expect(page.getByTestId('web-chat')).toContainText('fake pi response:', { timeout: 30_000 });
    await page.reload();
    await expect(page.getByTestId('web-chat')).toBeVisible({ timeout: 60_000 });
    await expect(input).toBeVisible();
    expect(paneRequests).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
}
