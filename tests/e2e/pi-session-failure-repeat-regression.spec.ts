/** Read-only Pi history stays intact offline and preserves distinct repeated requests. */
import { test, expect } from '@playwright/test';
import { openFixtureProject } from '../spec/helpers/spec-test-helpers.ts';
import { writeProviderHistory } from './helpers/provider-history-fixture.ts';

test('Pi history stays read-only offline and recovers the same saved turn on reconnect', async ({ page }) => {
  await openFixtureProject(page);
  const prompt = 'Saved Pi request before disconnect';
  const reply = 'Saved Pi reply before disconnect';
  const route = await writeProviderHistory('pi', 'pi-offline-readonly', [{ prompt, reply }]);
  const commands: string[] = [];
  page.on('websocket', socket => socket.on('framesent', ({ payload }) => {
    if (typeof payload === 'string' && /"type":"pi-command"/.test(payload)) commands.push(payload);
  }));
  await openFixtureProject(page, { reset: false });
  await page.goto(route, { waitUntil: 'networkidle' });
  const transcript = page.getByTestId('chat-scroll-container').last();
  await expect(transcript.getByText(reply, { exact: true })).toHaveCount(1);
  // Text fallback can paint before the lazy Markdown module finishes loading.
  await expect(transcript.locator('[aria-busy="true"]')).toHaveCount(0);
  await page.context().setOffline(true);
  try {
    await page.keyboard.press('Control+Enter');
    await page.keyboard.press('Control+Enter');
    await expect(page.locator('textarea.chat-input-placeholder')).toHaveCount(0);
    await expect(transcript.getByText(prompt, { exact: true })).toHaveCount(1);
    await expect(transcript.getByText(reply, { exact: true })).toHaveCount(1);
    expect(commands).toEqual([]);
  } finally {
    await page.context().setOffline(false);
  }
  await page.reload({ waitUntil: 'networkidle' });
  await expect(transcript.getByText(prompt, { exact: true })).toHaveCount(1);
  await expect(transcript.getByText(reply, { exact: true })).toHaveCount(1);
  expect(commands).toEqual([]);
});

test('distinct Pi requests with identical text remain separate turns after reload', async ({ page }) => {
  await openFixtureProject(page);
  const prompt = 'Repeat this exact Pi request';
  const route = await writeProviderHistory('pi', 'pi-distinct-repeat-requests', [
    { prompt, reply: 'First saved reply' }, { prompt, reply: 'Second saved reply' },
  ]);
  await openFixtureProject(page, { reset: false });
  await page.goto(route, { waitUntil: 'networkidle' });
  const transcript = page.getByTestId('chat-scroll-container').last();
  for (const reload of [false, true]) {
    if (reload) await page.reload({ waitUntil: 'networkidle' });
    await expect(transcript.getByText(prompt, { exact: true })).toHaveCount(2);
    await expect(transcript.getByText('First saved reply', { exact: true })).toHaveCount(1);
    await expect(transcript.getByText('Second saved reply', { exact: true })).toHaveCount(1);
    const text = await transcript.innerText();
    expect(text.indexOf('First saved reply')).toBeLessThan(text.lastIndexOf(prompt));
    expect(text.lastIndexOf(prompt)).toBeLessThan(text.indexOf('Second saved reply'));
  }
});
