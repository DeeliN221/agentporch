/**
 * PURPOSE: 验收测试：从已有工作流子会话创建新的工作流时，聊天视图不得串用旧会话消息。
 * Derived from openspec/changes/18-agentporch-bug/specs/project-workflow-control-plane/spec.md
 * and openspec/changes/18-agentporch-bug/specs/project-route-addressing/spec.md.
 */
import path from 'node:path';
import { test, expect } from '@playwright/test';
import {
  authenticatePage,
  openFixtureProject,
  PRIMARY_FIXTURE_PROJECT_PATH,
} from './helpers/spec-test-helpers.ts';

/**
 * Build the expected project route prefix from the Playwright fixture home.
 *
 * @returns {string}
 */
function buildExpectedProjectRoutePrefix() {
  const homePath = process.env.HOME || process.env.USERPROFILE || '';
  const relativePath = path.relative(homePath, PRIMARY_FIXTURE_PROJECT_PATH).split(path.sep).join('/');
  return `/${relativePath}`;
}

test.describe('Workflow child session隔离', () => {
  test.beforeEach(async ({ page }) => {
    await authenticatePage(page);
  });

  test('从 runId Child session创建新工作流后，不再展示旧Child session历史消息', async ({ page }) => {
    const projectRoutePrefix = buildExpectedProjectRoutePrefix();

    await openFixtureProject(page);
    await page.getByRole('button', { name: /登录升级/ }).click();
    await page.getByTestId('workflow-stage-table-preview').getByRole('button', { name: 'Execution session', exact: true }).click();

    await expect(page).toHaveURL(new RegExp(`${projectRoutePrefix}/runs/run-fixture/sessions/execution$`));

    await expect(page.locator('[data-testid="chat-scroll-container"]')).not.toContainText(
      'fixture-project session assistant turn 01',
    );

    await page.reload({ waitUntil: 'networkidle' });

    await expect(page).toHaveURL(new RegExp(`${projectRoutePrefix}/runs/run-fixture/sessions/execution$`));
    await expect(page.locator('[data-testid="chat-scroll-container"]')).not.toContainText(
      'fixture-project session assistant turn 01',
    );
  });
});
