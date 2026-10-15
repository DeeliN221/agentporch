/**
 * PURPOSE: Verify global agent settings no longer depend on standalone Codex
 * or Pi CLI availability checks.
 */

import { expect, test } from '@playwright/test';
import {
  openFixtureProject,
} from './helpers/spec-test-helpers.ts';

test('全局设置不再请求 Codex/Pi 独立 CLI 状态', async ({ page }) => {
  /**
   * Opening Settings must not query the removed provider status endpoints.
   */
  const cliStatusRequests: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    if (/\/api\/cli\/(codex|pi)\/status/.test(url)) {
      cliStatusRequests.push(url);
    }
  });

  await openFixtureProject(page);
  await page.getByRole('button', { name: /设置|Settings/ }).first().click();
  await expect(page.getByRole('tab', { name: /智能体|Agents/ })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: /外观|Appearance/ })).toBeVisible();

  await expect(page.locator('body')).not.toContainText(/CLI available|CLI unavailable|CLI 可用|CLI 不可用/);
  expect(cliStatusRequests).toEqual([]);
});
