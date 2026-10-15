/**
 * PURPOSE: 验收测试：项目工作区导航壳层与项目作用域路由。
 * Derived from openspec/changes/2030-agentporch-ui/specs/project-workspace-navigation/spec.md.
 * Sources: 2026-06-11-100-优化左侧导航活跃内容展示
 */
import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {
  authenticatePage,
  openFixtureProject,
  openFixtureManualSessionFromOverview,
} from './helpers/spec-test-helpers.ts';

const MOBILE_INLINE_SIDEBAR_EVIDENCE_DIR = path.resolve(
  process.cwd(),
  'test-results',
  '106-mobile-inline-sidebar',
);

async function openLoginWorkflowFromProjectOverview(page: Page) {
  /**
   * PURPOSE: Route through the project overview workflow card so the test does
   * not accidentally target the left attention navigation copy.
   */
  await page.getByTestId('project-overview-workflows').getByRole('button', { name: /登录升级/ }).click();
}

async function readExpandedSidebarWidth(page: Page) {
  /**
   * PURPOSE: Measure the rendered desktop sidebar panel so the regression
   * protects the user-visible empty-space contract.
   */
  return page.getByTestId('project-list').evaluate((projectList) => {
    const panel = projectList.closest('.relative.h-full.flex.flex-col') as HTMLElement | null;
    return panel ? Math.round(panel.getBoundingClientRect().width) : 0;
  });
}

test.describe('项目工作区导航壳层', () => {
  test.beforeEach(async ({ page }) => {
    await authenticatePage(page);
  });

  test('打开项目工作区主页', async ({ page }) => {
    await openFixtureProject(page);

    await expect(page).toHaveURL(/\/workspace\/[^/]+$/);
    await expect(page.getByTestId('project-workspace-overview')).toBeVisible();
    await expect(page.getByTestId('project-workspace-nav')).toHaveCount(0);
    await expect(page.getByTestId('project-overview-workflows')).toContainText('登录升级');
    await expect(page.getByTestId('project-overview-manual-sessions')).toContainText('fixture-project manu');
  });

  test('从项目主页进入工作流详情页', async ({ page }) => {
    await openFixtureProject(page);
    await openLoginWorkflowFromProjectOverview(page);

    await expect(page).toHaveURL(/\/workspace\/fixture-project\/runs\/run-fixture$/);
    await expect(page.getByTestId('project-workspace-nav')).toHaveCount(0);
    await expect(page.getByTestId('project-list')).toBeVisible();
    await expect(page.getByRole('heading', { name: '登录升级' }).last()).toBeVisible();
  });

  test('Workflow child session不会出现在项目主页Manual sessions列表里', async ({ page }) => {
    await openFixtureProject(page);
    await expect(page.getByTestId('project-overview-manual-sessions')).toContainText('fixture-project manu');
    await expect(page.getByTestId('project-overview-manual-sessions')).not.toContainText('codex-runner-execution-thread');
    await openLoginWorkflowFromProjectOverview(page);

    await expect(page.getByTestId('manual-session-group')).toHaveCount(0);
    await page.getByTestId('project-list-item-fixture-project-desktop-surface').click();
    await expect(page.getByTestId('project-overview-manual-sessions')).toContainText('fixture-project manu');
    await expect(page.getByTestId('project-overview-manual-sessions')).not.toContainText('Child session 规划');
    await expect(page.getByTestId('project-overview-manual-sessions')).not.toContainText('Child session Execution');
    await expect(page.getByTestId('project-overview-manual-sessions')).not.toContainText('codex-runner-execution-thread');
  });

  test('工作流详情用 wo 行进入 runner Child session且不展示Processes卡片', async ({ page }) => {
    await openFixtureProject(page);
    await openLoginWorkflowFromProjectOverview(page);

    await expect(page.getByTestId('workflow-runner-processes')).toHaveCount(0);

    await page.getByTestId('workflow-stage-table-cell-execution-0').locator('button').first().click();
    await expect(page).toHaveURL(/\/workspace\/fixture-project\/runs\/run-fixture\/sessions\/execution$/);
  });

  test('从项目主页进入Manual sessions页', async ({ page }) => {
    test.setTimeout(60_000);
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (text: string) => {
            (window as unknown as { __copiedSessionId?: string }).__copiedSessionId = text;
          },
        },
      });
    });
    await openFixtureProject(page);
    await openFixtureManualSessionFromOverview(page);

    await expect(page).toHaveURL(/\/workspace\/fixture-project\/c\d+$/);
    const title = page.getByTestId('main-content-title');
    const copySessionIdButton = title.getByRole('button', { name: 'Copy session ID' });
    await expect(copySessionIdButton).toBeVisible();
    await expect(title.locator('code')).toHaveCount(0);
    await copySessionIdButton.click();
    await expect(title.getByRole('button', { name: 'Session ID copied' })).toBeVisible();
    await expect.poll(() => page.evaluate(() => (
      (window as unknown as { __copiedSessionId?: string }).__copiedSessionId
    ))).toBe('fixture-project-manual-session');
    await expect(page.getByTestId('project-workspace-nav')).toHaveCount(0);
    await expect(page.locator('[data-testid="chat-scroll-container"]')).toContainText(
      'fixture-project manual-only session assistant turn 01',
    );
    // Re-render the same short history after viewport calibration has completed.
    const snapshot = page.getByTestId('chat-rendered-snapshot-pane');
    for (let repeat = 0; repeat < 3; repeat += 1) {
      const previousVersion = Number(await snapshot.getAttribute('data-snapshot-version'));
      await page.getByTestId('tab-chat').click();
      await expect.poll(async () => Number(await snapshot.getAttribute('data-snapshot-version'))).toBeGreaterThan(previousVersion);
      await expect(snapshot).toHaveAttribute('data-history-prefetch-state', 'exhausted');
      await expect(snapshot).toContainText('fixture-project manual-only session assistant turn 01');
    }
  });

  test('Render 保持只读，顶部 Home 返回待办看板', async ({ page }) => {
    await openFixtureProject(page);

    await expect(page.getByTestId('project-workspace-overview')).toBeVisible();
    await expect(page.getByTestId('tab-overview')).toHaveAttribute('aria-pressed', 'true');

    await openFixtureManualSessionFromOverview(page);
    await page.getByTestId('tab-chat').click();
    await expect(page.getByTestId('project-workspace-overview')).toHaveCount(0);
    await expect(page.getByTestId('chat-rendered-snapshot-pane')).toBeVisible();
    await expect(page.locator('textarea.chat-input-placeholder')).toHaveCount(0);
    await expect(page.locator('.xterm')).toHaveCount(0);

    await page.getByTestId('tab-overview').click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId('session-attention-board')).toBeVisible();
    await page.getByTestId('project-list-item-fixture-project-desktop-surface').click();
    await expect(page.getByTestId('project-workspace-overview')).toBeVisible();
  });

  test('点击左侧项目名返回项目主页', async ({ page }) => {
    await openFixtureProject(page);
    await openFixtureManualSessionFromOverview(page);

    await expect(page).toHaveURL(/\/workspace\/fixture-project\/c\d+$/);
    await page.getByRole('button', { name: /^fixture-project\b/i }).first().click();

    await expect(page).toHaveURL(/\/workspace\/fixture-project$/);
    await expect(page.getByTestId('project-workspace-overview')).toBeVisible();
  });

  test('移动端打开Session 页工作区导航', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openFixtureProject(page);
    fs.mkdirSync(MOBILE_INLINE_SIDEBAR_EVIDENCE_DIR, { recursive: true });
    await page.screenshot({
      path: path.join(MOBILE_INLINE_SIDEBAR_EVIDENCE_DIR, 'project-list-entry.png'),
      fullPage: true,
    });
    await page.goto(`${new URL(page.url()).origin}/workspace/fixture-project/c3`);

    await expect(page.getByTestId('project-workspace-nav')).toHaveCount(0);
    await page.getByRole('button', { name: /Open menu/i }).click();
    await expect(page.getByTestId('project-list')).toBeVisible();
    await expect(page.getByTestId('project-list')).toContainText('fixture-project');
    await expect(page.getByTestId('project-workflow-group')).toHaveCount(0);
    await expect(page.getByTestId('manual-session-group')).toHaveCount(0);
    const collapseButton = page.getByRole('button', { name: /隐藏侧边栏|Hide sidebar/i });
    await expect(collapseButton).toBeVisible();
    await expect(collapseButton.locator('.animate-ping')).toHaveCount(0);
    await page.mouse.click(380, 420);
    await expect(page.getByTestId('project-list')).toBeVisible();
    await collapseButton.click();
    await expect(page.getByTestId('project-list')).toBeHidden();
  });

  test('桌面侧栏折叠后不保留左侧窄栏', async ({ page }) => {
    /**
     * PURPOSE: Protect the sidebar as a compact navigation surface: no
     * persistent refresh button, no old fixed empty width, and desktop
     * collapse matches the mobile menu-button entry pattern.
     */
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.addInitScript(() => {
      window.localStorage.removeItem('agentporch:sidebar-width');
      window.localStorage.setItem('uiPreferences', JSON.stringify({ sidebarVisible: true }));
    });

    await openFixtureProject(page);

    const sidebarWidth = await readExpandedSidebarWidth(page);
    expect(sidebarWidth).toBeGreaterThan(0);
    expect(sidebarWidth).toBeLessThan(272);

    await expect(page.getByRole('button', { name: /刷新项目和会话|Refresh projects and sessions/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /打开新项目|Open project/i })).toBeVisible();

    await page.getByRole('button', { name: /隐藏侧边栏|Hide sidebar/i }).click();
    await expect(page.getByTestId('project-list')).toBeHidden();
    await expect(page.getByRole('button', { name: /打开新项目|Open project/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /显示侧边栏|Show sidebar/i })).toHaveCount(0);

    const menuButton = page.getByRole('button', { name: /Open menu/i });
    await expect(menuButton).toBeVisible();
    await menuButton.click();
    await expect(page.getByTestId('project-list')).toBeVisible();
    await expect(page.getByRole('button', { name: /Open menu/i })).toHaveCount(0);
    await expect(page.getByTestId('create-project').first()).toBeVisible();
  });
});
