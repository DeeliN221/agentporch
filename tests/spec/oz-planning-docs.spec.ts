// @ts-nocheck -- strict:true enabled; incremental tightening tracked.
/**
 * PURPOSE: 规划文档独立于工作流表格，通过 Files 打开真实 oz change 产物。
 * 覆盖 active change、无规划会话、归档后刷新场景，验证文档内容和路径正确性。
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {
  authenticatePage,
  openFixtureProject,
  openFilesTab,
} from './helpers/spec-test-helpers.ts';
import { PLAYWRIGHT_FIXTURE_PROJECT_PATHS } from '../e2e/helpers/playwright-fixture.ts';
import { resolveFlowRunStatePath } from '../../backend/domains/workflows/flow-runtime-paths.ts';

const OZ_CHANGE_NAME = '2026-05-14-test-planning-docs';

const ACTIVE_PROPOSAL = '# 提案\n\nACTIVE Test提案内容。\n';
const ACTIVE_DESIGN = '# 设计\n\nACTIVE Test设计内容。\n';
const ACTIVE_SPEC = '# 规格\n\nACTIVE Test规格内容。\n';
const ACTIVE_TASK = '# 任务\n\nACTIVE Test任务内容。\n';
const ACTIVE_BRIEF = '# 简报\n\nACTIVE Test简报内容。\n';
const ACTIVE_ACCEPTANCE = '{ "summary": "ACTIVE Test验收合同" }\n';
const ACTIVE_EXTRA = '# 额外产物\n\nACTIVE 额外顶层产物。\n';
const ARCHIVE_PROPOSAL = '# 提案\n\nARCHIVE Test提案内容。\n';

/**
 * Create active oz change top-level artifacts in the fixture project.
 */
function writeActiveOzChangeDocs() {
  const projectPath = PLAYWRIGHT_FIXTURE_PROJECT_PATHS[0];
  const changeDir = path.join(projectPath, 'docs', 'changes', OZ_CHANGE_NAME);
  fs.mkdirSync(path.join(changeDir, 'tests'), { recursive: true });
  fs.mkdirSync(path.join(changeDir, 'notes'), { recursive: true });

  fs.writeFileSync(path.join(changeDir, 'brief.md'), ACTIVE_BRIEF, 'utf8');
  fs.writeFileSync(path.join(changeDir, 'proposal.md'), ACTIVE_PROPOSAL, 'utf8');
  fs.writeFileSync(path.join(changeDir, 'design.md'), ACTIVE_DESIGN, 'utf8');
  fs.writeFileSync(path.join(changeDir, 'spec.md'), ACTIVE_SPEC, 'utf8');
  fs.writeFileSync(path.join(changeDir, 'task.md'), ACTIVE_TASK, 'utf8');
  fs.writeFileSync(path.join(changeDir, 'acceptance.json'), ACTIVE_ACCEPTANCE, 'utf8');
  fs.writeFileSync(path.join(changeDir, 'tests', 'planning-docs.spec.ts'), 'export {};\n', 'utf8');
  fs.writeFileSync(path.join(changeDir, 'notes', 'qa-note.md'), '# QA Note\n', 'utf8');
  fs.writeFileSync(path.join(changeDir, 'z-extra.md'), ACTIVE_EXTRA, 'utf8');
}

/**
 * Write a wo state fixture with change_name and a planning session.
 */
function writeActivePlanningWorkflowFixture() {
  writeWorkflowFixture({ withSession: true });
}

/**
 * Write a wo state fixture with change_name but NO planning session.
 */
function writeActivePlanningWorkflowFixtureNoSession() {
  writeWorkflowFixture({ withSession: false });
}

function writeWorkflowFixture({ withSession }) {
  const projectPath = PLAYWRIGHT_FIXTURE_PROJECT_PATHS[0];
  const statePath = resolveFlowRunStatePath(projectPath, 'run-fixture');
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  const baseState = {
    ...state,
    change_name: OZ_CHANGE_NAME,
    status: 'running',
    stage: 'planning',
    stages: { planning: 'active', execution: 'pending' },
  };
  if (withSession) {
    baseState.sessions = { ...baseState.sessions, 'codex:planner': 'planning-session-id' };
  } else {
    // Remove planning session key explicitly so there is no jump-able session link
    if (baseState.sessions) {
      delete baseState.sessions['codex:planner'];
    }
  }
  fs.writeFileSync(statePath, `${JSON.stringify(baseState, null, 2)}\n`, 'utf8');
}

/**
 * Move active oz change to archive, overwrite proposal.md with archive content,
 * and update the wo state.
 */
function archiveOzChangeAndRefreshWorkflow() {
  const projectPath = PLAYWRIGHT_FIXTURE_PROJECT_PATHS[0];
  const activeDir = path.join(projectPath, 'docs', 'changes', OZ_CHANGE_NAME);
  const archiveDir = path.join(projectPath, 'docs', 'changes', 'archive', OZ_CHANGE_NAME);
  fs.mkdirSync(path.dirname(archiveDir), { recursive: true });
  fs.renameSync(activeDir, archiveDir);

  // Overwrite proposal.md with archive-specific content so tests can verify
  // the archived file is opened, not a stale active-path reference.
  fs.writeFileSync(path.join(archiveDir, 'proposal.md'), ARCHIVE_PROPOSAL, 'utf8');

  // Update the wo state so the backend re-reads after refresh
  const statePath = resolveFlowRunStatePath(projectPath, 'run-fixture');
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

/**
 * Navigate from the project overview into the workflow detail page.
 * After setting change_name, the workflow card title becomes OZ_CHANGE_NAME.
 */
async function navigateToWorkflowDetail(page) {
  const workflowsPanel = page.getByTestId('project-overview-workflows');
  const workflowCard = workflowsPanel.getByRole('button', { name: OZ_CHANGE_NAME }).first();
  if (await workflowCard.count() === 0) {
    await workflowsPanel.getByRole('button', { name: /Automated workflows/ }).click();
  }
  await workflowCard.click();
}

/**
 * Open the workflow detail page for the fixture run (active change, with session).
 */
async function openWorkflowDetailPage(page) {
  await authenticatePage(page);
  await openFixtureProject(page);

  writeActiveOzChangeDocs();
  writeActivePlanningWorkflowFixture();
  await page.reload({ waitUntil: 'networkidle' });

  await navigateToWorkflowDetail(page);
}

/**
 * Open the workflow detail page for the fixture run (active change, NO session).
 */
async function openWorkflowDetailPageNoSession(page) {
  await authenticatePage(page);
  await openFixtureProject(page);

  writeActiveOzChangeDocs();
  writeActivePlanningWorkflowFixtureNoSession();
  await page.reload({ waitUntil: 'networkidle' });

  await navigateToWorkflowDetail(page);
}

async function openPlanningFiles(page, archived = false) {
  await expect(page.getByTestId('workflow-stage-table-column-planning')).toHaveCount(0);
  await expect(page.getByTestId('workflow-status-tree-row-planning')).toHaveCount(0);
  await openFilesTab(page);
  for (const directory of ['docs', 'changes', ...(archived ? ['archive'] : []), OZ_CHANGE_NAME]) {
    await page.getByText(directory, { exact: true }).and(page.locator('.select-none span')).click();
  }
  for (const file of ['brief.md', 'proposal.md', 'design.md', 'spec.md', 'task.md', 'acceptance.json', 'z-extra.md']) {
    await expect(page.getByText(file, { exact: true })).toBeVisible();
  }
  await page.getByText('tests', { exact: true }).first().click();
  await expect(page.getByText('planning-docs.spec.ts', { exact: true })).toBeVisible();
  await expect(page.getByText('notes', { exact: true }).first()).toBeVisible();
  await page.getByText('proposal.md', { exact: true }).click();
  await expect(page.getByRole('heading', { name: 'proposal.md' })).toBeVisible();
  await expect(page.getByText(archived ? 'ARCHIVE Test提案内容。' : 'ACTIVE Test提案内容。', { exact: true })).toBeVisible();
}

test.describe('规划文档独立于四阶段表格', () => {
  test('有规划会话时通过 Files 打开规划产物', async ({ page }) => {
    await openWorkflowDetailPage(page);
    await openPlanningFiles(page);
  });

  test('没有规划会话时仍能打开规划产物', async ({ page }) => {
    await openWorkflowDetailPageNoSession(page);
    await openPlanningFiles(page);
  });

  test('归档并刷新后打开归档路径下的规划产物', async ({ page }) => {
    await openWorkflowDetailPage(page);
    archiveOzChangeAndRefreshWorkflow();
    await page.reload({ waitUntil: 'networkidle' });
    await openPlanningFiles(page, true);
    await expect(page.getByText('ACTIVE Test提案内容。', { exact: true })).toHaveCount(0);
  });
});
