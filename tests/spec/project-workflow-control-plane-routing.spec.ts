/**
 * PURPOSE: 验收测试：需求工作流详情路由与会话流程图预览交互。
 * Derived from openspec/changes/2030-agentporch-ui/specs/project-workflow-control-plane/spec.md.
 */
import { test, expect } from '@playwright/test';
import {
  authenticatePage,
  openFixtureProject,
  openFixtureManualSessionFromOverview,
} from './helpers/spec-test-helpers.ts';

test.describe('Workflows详情路由与Session 流程图预览', () => {
  test.beforeEach(async ({ page }) => {
    await authenticatePage(page);
  });

  test('侧边栏只显示项目清单，详情入口留在项目主页', async ({ page }) => {
    await openFixtureProject(page);
    await page.getByRole('button', { name: /登录升级/ }).click();

    await expect(page.getByTestId('project-workspace-nav')).toHaveCount(0);
    await expect(page.getByTestId('project-list')).toBeVisible();
    await expect(page.getByTestId('project-workflow-group')).toHaveCount(0);
    await expect(page.getByTestId('manual-session-group')).toHaveCount(0);
    await page.getByTestId('project-list-item-fixture-project-desktop-surface').click();
    const workflows = page.getByTestId('project-overview-workflows');
    await workflows.getByRole('button', { name: /Automated workflows/ }).click();
    await expect(workflows).toContainText('登录升级');
    await expect(page.getByTestId('project-overview-manual-sessions')).toContainText('fixture-project manu');
  });

  test('工作流详情展示阶段树，工作流Session 不展示流程图预览', async ({ page }) => {
    await openFixtureProject(page);
    await page.getByRole('button', { name: /登录升级/ }).click();

    await expect(page).toHaveURL(/\/workspace\/fixture-project\/runs\/run-fixture$/);
    await expect(page.getByRole('heading', { name: '登录升级' }).last()).toBeVisible();
    await expect(page.getByTestId('workflow-stage-table-preview')).toBeVisible();
    await expect(page.getByTestId('workflow-stage-mini-map')).toHaveCount(0);
    await expect(page.getByTestId('workflow-stage-tree')).toHaveCount(0);

    await page.getByTestId('workflow-stage-table-preview').getByRole('button', { name: 'Execution session', exact: true }).click();
    await expect(page).toHaveURL(/\/workspace\/fixture-project\/runs\/run-fixture\/sessions\/execution$/);
    await expect(page.getByTestId('workflow-minimap')).toHaveCount(0);
    await expect(page.getByTestId('workflow-minimap-drag-handle')).toHaveCount(0);
    await expect(page.getByTestId('workflow-stage-tree-preview')).toHaveCount(0);
  });

  test('Manual sessions详情不展示工作流流程图预览', async ({ page }) => {
    await openFixtureProject(page);
    await openFixtureManualSessionFromOverview(page);

    await expect(page).toHaveURL(/\/workspace\/fixture-project\/c\d+$/);
    await expect(page.locator('[data-testid="chat-scroll-container"]')).toContainText(
      'fixture-project manual-only session assistant turn 01',
    );
    await expect(page.getByTestId('workflow-minimap')).toHaveCount(0);
    await expect(page.getByTestId('workflow-minimap-drag-handle')).toHaveCount(0);
    await expect(page.getByTestId('workflow-stage-tree-preview')).toHaveCount(0);
  });
});
