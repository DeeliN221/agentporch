/** Exercise the real language setting, homepage, project controls and persisted preference. */
import { test, expect } from '@playwright/test';
import { authenticatePage, openFixtureProject } from './helpers/spec-test-helpers';

test('home and project controls follow the language setting, including after reload', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  let empty = false;
  await page.route('**/api/session-attention?*', route => route.fulfill({ json: { items: empty ? [] : [{
    provider: 'codex', sessionId: 'localization-demo', projectPath: '/demo/sample-project',
    title: 'Review the sample change', firstRequest: 'Review the sample change', latestRequest: 'Check the result',
    lastActivity: '2026-10-15T06:00:00.000Z', activityRevision: 1,
  }] } }));
  await authenticatePage(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Pending sessions' })).toBeVisible();
  await page.getByRole('button', { name: 'Settings', exact: true }).filter({ visible: true }).click();
  await page.locator('select').filter({ has: page.locator('option[value="zh-CN"]') }).selectOption('zh-CN');
  await page.locator('.modal-backdrop').getByRole('button', { name: '取消', exact: true }).click();
  const board = page.getByTestId('session-attention-board');
  await expect(board.getByRole('heading')).toHaveText('待处理会话');
  await expect(board.getByRole('button', { name: '全部标记为已处理', exact: true })).toBeVisible();
  await expect(board).toContainText('右滑标记为已处理');
  await expect(board).not.toContainText('Swipe right');
  await page.reload();
  await expect(board.getByRole('heading')).toHaveText('待处理会话');
  empty = true;
  await page.reload();
  await expect(board).toContainText('暂无待处理会话');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(board.getByRole('heading')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 800 });
  await openFixtureProject(page);
  const overview = page.getByTestId('project-workspace-overview');
  await expect(overview).toContainText('自动工作流');
  await expect(overview).toContainText('手动会话');
  await expect(overview.getByRole('combobox', { name: '手动会话排序' })).toBeVisible();
  await overview.getByRole('button', { name: '选择', exact: true }).click();
  await expect(overview).toContainText('选择当前显示的会话');
  await overview.getByRole('button', { name: '退出选择', exact: true }).click();
  await page.getByRole('button', { name: '设置', exact: true }).filter({ visible: true }).click();
  await page.locator('select').filter({ has: page.locator('option[value="en"]') }).selectOption('en');
  await page.locator('.modal-backdrop').getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(overview).toContainText('Automated workflows');
  await expect(overview).toContainText('Manual sessions');
  await page.reload();
  await expect(overview).toContainText('Manual sessions');
  expect(errors).toEqual([]);
});
