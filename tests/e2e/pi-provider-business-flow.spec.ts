/**
 * Business scenarios: A user creates a Pi session from the project picker.
 * The real draft API allocates the route before any provider session exists.
 * An unbound draft must not appear as a saved provider conversation.
 * Native terminal input carries the new route and project identity.
 * The terminal transport is stubbed to avoid external model calls.
 * Failure meaning: Incorrect init fields can resume another conversation.
 * Render remains read-only and must not send legacy chat commands.
 * Reloading Render must not start an unattended terminal for the user.
 */
import { test, expect, type Page } from '@playwright/test';
import { openFixtureProject, PRIMARY_FIXTURE_PROJECT_PATH, authHeaders } from '../spec/helpers/spec-test-helpers.ts';

const messages = new WeakMap<Page, Record<string, any>[]>();
test.beforeEach(async ({ page }) => {
  messages.set(page, []);
  await page.route('**/api/diagnostics/runtime-dependencies', async route => {
    const response = await route.fetch();
    const payload = await response.json();
    payload.capabilities = { ...payload.capabilities, manualSessions: ['pi', 'codex'] };
    await route.fulfill({ response, json: payload });
  });
  await page.routeWebSocket('**/shell**', socket => {
    socket.onMessage(data => {
      const message = JSON.parse(String(data));
      messages.get(page)!.push(message);
      if (message.type === 'init') socket.send(JSON.stringify({ type: 'output', data: 'Pi fixture terminal ready\r\n' }));
    });
  });
  await openFixtureProject(page);
});

async function createPi(page: Page) {
  await page.getByTestId('project-new-session-button').click();
  await page.getByTestId('project-new-session-provider-pi').click();
  await expect(page).toHaveURL(/\/c\d+\?tab=shell&provider=pi$/);
  await expect(page.locator('.xterm')).toBeVisible();
  await expect.poll(() => messages.get(page)!.filter(message => message.type === 'init').length).toBe(1);
  return new URL(page.url()).pathname.split('/').at(-1)!;
}

test('project overview manual-session picker includes Pi', async ({ page }) => {
  await page.getByTestId('project-new-session-button').click();
  await expect(page.getByTestId('project-new-session-provider-pi')).toHaveText('Pi');
});

test('a new Pi draft is absent from provider history until bound', async ({ page, request }) => {
  const routeId = await createPi(page);
  const response = await request.get(`/api/projects/fixture-project/overview?${new URLSearchParams({ projectPath: PRIMARY_FIXTURE_PROJECT_PATH })}`, { headers: authHeaders() });
  expect(response.ok()).toBeTruthy();
  const overview = await response.json();
  expect(overview.piSessions).toBeInstanceOf(Array);
  expect(overview.piSessions.some((session: { id: string }) => session.id === routeId)).toBe(false);
});

test('Pi input uses native terminal transport with the new route identity', async ({ page }) => {
  const routeId = await createPi(page);
  expect(messages.get(page)!.find(message => message.type === 'init')).toMatchObject({
    provider: 'pi', routeSessionId: routeId, providerSessionId: null, hasSession: false,
    projectPath: PRIMARY_FIXTURE_PROJECT_PATH,
  });
  await page.locator('.xterm-helper-textarea').pressSequentially('Hello Pi');
  await page.locator('.xterm-helper-textarea').press('Enter');
  await expect.poll(() => messages.get(page)!.filter(message => message.type === 'input').map(message => message.data).join('')).toContain('Hello Pi\r');
  await expect(page.locator('textarea.chat-input-placeholder')).toHaveCount(0);
  expect(messages.get(page)!.some(message => message.type === 'pi-command')).toBe(false);
});

test('Pi Render is read-only and reloading it does not initialize a terminal', async ({ page }) => {
  await createPi(page);
  const url = new URL(page.url());
  url.searchParams.set('tab', 'chat');
  messages.set(page, []);
  await page.goto(url.toString(), { waitUntil: 'networkidle' });
  await expect(page.getByTestId('chat-rendered-snapshot-pane')).toBeVisible();
  await expect(page.locator('.xterm')).toHaveCount(0);
  await expect(page.locator('textarea.chat-input-placeholder')).toHaveCount(0);
  expect(messages.get(page)!.filter(message => message.type === 'init')).toEqual([]);
});
