// @ts-nocheck -- Browser evidence test keeps assertions focused on user-visible behavior.
/**
 * PURPOSE: Opening read-only Codex history must not change persisted model settings.
 */
import { test, expect } from '@playwright/test';

import {
  authHeaders,
  getFixtureProject,
  openFixtureProject,
  PRIMARY_FIXTURE_PROJECT_PATH,
} from '../spec/helpers/spec-test-helpers.ts';

const SESSION_ID = 'fixture-project-manual-session';
const SESSION_TITLE_PATTERN = /fixture-project manu/i;

test('readonly Codex history leaves persisted reasoning depth unchanged across reload', async ({ page, request }) => {
  /**
   * Seed a persisted depth and verify that opening and refreshing history never writes it.
   */
  const modelStateRequests = [];

  await openFixtureProject(page);
  const project = await getFixtureProject(request);
  await seedCodexReasoningEffort(request, project.name, 'medium');

  page.on('request', (httpRequest) => {
    if (httpRequest.method() !== 'PUT' || !httpRequest.url().includes('/model-state')) {
      return;
    }
    modelStateRequests.push(JSON.parse(httpRequest.postData() || '{}'));
  });

  await openFixtureProject(page, { reset: false });
  await page.getByTestId('project-overview-manual-sessions')
    .getByRole('button', { name: SESSION_TITLE_PATTERN })
    .first()
    .click();

  await expect(page.getByTestId('chat-rendered-snapshot-pane')).toBeVisible();
  await expect(page.getByTestId('session-depth-select')).toHaveCount(0);
  await expect(page.getByTestId('session-model-select')).toHaveCount(0);
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.getByTestId('chat-rendered-snapshot-pane')).toBeVisible();
  expect(modelStateRequests).toEqual([]);
  const response = await request.get(
    `/api/projects/${encodeURIComponent(project.name)}/sessions/${encodeURIComponent(SESSION_ID)}/model-state?provider=codex&projectPath=${encodeURIComponent(PRIMARY_FIXTURE_PROJECT_PATH)}`,
    { headers: authHeaders() },
  );
  expect(response.ok()).toBe(true);
  expect((await response.json()).state.reasoningEffort).toBe('medium');

});

async function seedCodexReasoningEffort(request, projectName, reasoningEffort) {
  /**
   * Persist a real session model-state value through the same API the UI uses.
   */
  const response = await request.put(
    `/api/projects/${encodeURIComponent(projectName)}/sessions/${encodeURIComponent(SESSION_ID)}/model-state`,
    {
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      data: {
        projectPath: PRIMARY_FIXTURE_PROJECT_PATH,
        provider: 'codex',
        model: 'gpt-5-codex',
        reasoningEffort,
      },
    },
  );
  expect(response.ok()).toBe(true);
}
