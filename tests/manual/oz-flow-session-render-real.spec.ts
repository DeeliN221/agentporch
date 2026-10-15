/**
 * PURPOSE: Verify a real oz flow child session can reconnect through the
 * long-running server and render its bounded transcript snapshot.
 */
import path from 'node:path';

import { expect, test } from '@playwright/test';

const REAL_SESSION_URL = process.env.AGENTPORCH_REAL_SESSION_URL;
const REAL_SESSION_ID = process.env.AGENTPORCH_REAL_SESSION_ID;
const SCREENSHOT_PATH = path.join(
  process.cwd(),
  'test-results/browser-evidence/flow-session-render/after-render.png',
);

test('真实 oz flow Child session可通过常驻服务渲染', async ({ page }) => {
  test.skip(!REAL_SESSION_URL || !REAL_SESSION_ID, 'Set a test session URL and ID explicitly.');
  /** Exercise the exact user route with its real backend, auth, and transcript. */
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  const initialHistory = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname.includes(`/sessions/${REAL_SESSION_ID}/messages`)
      && url.searchParams.get('offset') === '0';
  });
  await page.goto(REAL_SESSION_URL!, { waitUntil: 'domcontentloaded' });
  await initialHistory;
  await page.getByTestId('tab-chat').click();
  await expect(page.getByRole('heading', { name: 'First repair' })).toBeVisible();
  await page.getByTestId('tab-shell').click();
  await page.getByTestId('tab-chat').click();

  await expect(page.getByTestId('chat-rendered-snapshot-pane')).toBeVisible();
  await expect(page.getByText('Something went wrong')).toHaveCount(0);
  await expect.poll(() => pageErrors).toEqual([]);
  await page.getByTestId('chat-rendered-snapshot-pane').screenshot({ path: SCREENSHOT_PATH });
});
