/** Project-file discovery from read-only history uses Files; provider CLI completion belongs to Shell. */
import { test, expect } from '@playwright/test';
import {
  openFixtureProject,
  openFixtureManualSessionFromOverview,
  openFilesTab,
  writeWorkspaceTextFile,
} from '../spec/helpers/spec-test-helpers.ts';

test.beforeEach(async ({ page }) => {
  await openFixtureProject(page);
  await writeWorkspaceTextFile('src/domain/SettlementPolicy.ts', 'export const policy = true;\n');
  await openFixtureManualSessionFromOverview(page);
  await expect(page.getByTestId('chat-rendered-snapshot-pane')).toBeVisible();
  await expect(page.locator('textarea.chat-input-placeholder')).toHaveCount(0);
  await expect(page.getByTestId('file-mention-tree')).toHaveCount(0);
  await openFilesTab(page);
});

test('history opens a nested project file through Files without a chat composer', async ({ page }) => {
  await page.getByText('src', { exact: true }).click();
  await page.getByText('domain', { exact: true }).click();
  await page.getByText('SettlementPolicy.ts', { exact: true }).click();
  await expect(page.getByRole('heading', { name: 'SettlementPolicy.ts', exact: true })).toBeVisible();
  await expect(page.locator('.cm-content')).toContainText('export const policy = true;');
});

test('Files search filters loaded nested project files from history', async ({ page }) => {
  await page.getByText('src', { exact: true }).click();
  await page.getByText('domain', { exact: true }).click();
  await expect(page.getByText('SettlementPolicy.ts', { exact: true })).toBeVisible();
  await page.getByPlaceholder('Search files and folders...').fill('SettlementPolicy');
  await expect(page.getByText('SettlementPolicy.ts', { exact: true })).toBeVisible();
  await page.getByText('SettlementPolicy.ts', { exact: true }).click();
  await expect(page.getByRole('heading', { name: 'SettlementPolicy.ts', exact: true })).toBeVisible();
});
