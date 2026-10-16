/**
 * Pi web chat sends structured messages without opening an agent terminal.
 * Business scenarios: The provider picker must expose Pi when its runtime is available.
 * A new conversation initially owns a stable local route rather than a provider ID.
 * Draft routes must not appear as persisted provider histories before binding.
 * Sending must carry both the route identity and the project working directory.
 * Capturing actual WebSocket frames catches a composer that only clears its text.
 * A reload must restore the composer without requiring a terminal connection.
 * Draft restoration protects unsent work when users refresh the page.
 * Failure meaning: A user can lose access to chat if selection depends on pane focus.
 */
import { test, expect, type Page } from '@playwright/test';
import { authenticatePage, getFixtureProject, authHeaders, PRIMARY_FIXTURE_PROJECT_PATH } from '../spec/helpers/spec-test-helpers.ts';
import { buildProjectRoute } from '../../frontend/utils/projectRoute.ts';

const messages = new WeakMap<Page, Record<string, any>[]>();
test.beforeEach(async ({ page }) => {
  messages.set(page, []);
  page.on('websocket', socket => socket.on('framesent', event => {
    try { messages.get(page)!.push(JSON.parse(String(event.payload))); } catch { /* Ignore non-JSON frames. */ }
  }));
  await page.route('**/api/diagnostics/runtime-dependencies', async route => {
    const response = await route.fetch(); const payload = await response.json();
    payload.capabilities = { ...payload.capabilities, manualSessions: ['pi', 'codex'] };
    await route.fulfill({ response, json: payload });
  });
  await authenticatePage(page);
  await page.goto(buildProjectRoute(await getFixtureProject(page.request)));
});
async function createPi(page: Page) {
  await page.getByTestId('project-new-session-button').click();
  await page.getByTestId('project-new-session-provider-pi').click();
  await expect(page).toHaveURL(/\/c\d+\?tab=chat&provider=pi$/);
  await expect(page.locator('textarea.chat-input-placeholder')).toBeVisible();
  await expect(page.locator('.xterm')).toHaveCount(0);
  return new URL(page.url()).pathname.split('/').at(-1)!;
}
test('project overview manual-session picker includes Pi', async ({ page }) => {
  await page.getByTestId('project-new-session-button').click();
  await expect(page.getByTestId('project-new-session-provider-pi')).toHaveText('Pi');
});
test('a new Pi draft is absent from provider history until bound', async ({ page, request }) => {
  const routeId = await createPi(page);
  const project = await getFixtureProject(request);
  const response = await request.get(`/api/projects/${encodeURIComponent(project.name)}/overview?${new URLSearchParams({ projectPath: PRIMARY_FIXTURE_PROJECT_PATH })}`, { headers: authHeaders() });
  expect(response.ok()).toBeTruthy();
  const overview = await response.json();
  expect(overview.piSessions.some((session: { id: string }) => session.id === routeId)).toBe(false);
});
test('Pi web input carries the selected route and project identity', async ({ page }) => {
  const routeId = await createPi(page);
  await page.locator('textarea.chat-input-placeholder').fill('Review the web chat flow');
  await page.locator('form button[type=submit]').last().click();
  await expect.poll(() => messages.get(page)!.find(message => message.type === 'pi-command')).toMatchObject({
    command: 'Review the web chat flow', agentporchSessionId: routeId,
    options: { projectPath: PRIMARY_FIXTURE_PROJECT_PATH },
  });
  expect(messages.get(page)!.some(message => message.type === 'init')).toBe(false);
});
test('reloading web chat leaves the composer available without a terminal', async ({ page }) => {
  await createPi(page);
  await page.locator('textarea.chat-input-placeholder').fill('Keep this draft');
  await page.reload();
  await expect(page.locator('textarea.chat-input-placeholder')).toHaveValue('Keep this draft');
  await expect(page.locator('.xterm')).toHaveCount(0);
});
