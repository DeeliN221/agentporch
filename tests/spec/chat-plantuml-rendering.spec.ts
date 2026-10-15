// @ts-nocheck -- Browser fixture helpers use shared dynamic test globals.
/**
 * Verify puml fences in persisted Codex history use the bundled PlantUML
 * engine to render images without an external rendering server.
 */
import { test, expect } from '@playwright/test';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { PLAYWRIGHT_FIXTURE_HOME } from '../e2e/helpers/playwright-fixture.ts';
import {
  PRIMARY_FIXTURE_PROJECT_PATH,
  authenticatePage,
  resetWorkspaceProject,
} from './helpers/spec-test-helpers.ts';

const SESSION_DAY = ['2026', '10', '09'];
const SESSION_ID = 'spec-chat-plantuml-rendering';
const PLANTUML_SOURCE = '@startuml\nAlice -> Bob: persisted puml diagram\n@enduml';
test.beforeEach(async ({ page }) => {
  /** Prepare an isolated workspace and authenticated page for persisted history. */
  await resetWorkspaceProject();
  await authenticatePage(page);
});

test('Codex persisted puml fenced blocks render as PlantUML images', async ({ page }) => {
  /** Scenario: Reloading real JSONL still renders the puml image successfully. */

  await writeCodexSession();
  await openCodexSession(page, SESSION_ID);
  await page.reload({ waitUntil: 'networkidle' });

  const transcript = page.locator('[data-testid="chat-scroll-container"]').last();
  const image = transcript.locator('.markdown-plantuml-diagram img');
  await expect(image).toBeVisible();
  await expect(image).toHaveJSProperty('complete', true);
  await expect.poll(() => image.evaluate((element) => element.naturalWidth)).toBeGreaterThan(0);
  const svg = await image.evaluate(async (element) => (await fetch(element.src)).text());
  expect(svg).toContain('persisted puml diagram');

});

/**
 * Write PlantUML content into an isolated Codex JSONL session.
 */
async function writeCodexSession(): Promise<void> {
  /** Verify Markdown rendering through persisted-session replay. */
  const sessionDir = path.join(PLAYWRIGHT_FIXTURE_HOME, '.codex', 'sessions', ...SESSION_DAY);
  await fs.mkdir(sessionDir, { recursive: true });
  const assistantContent = [
    '下面是持久化Session 中的 PlantUML 图：',
    '',
    '```puml',
    ...PLANTUML_SOURCE.split('\n'),
    '```',
    '',
    '图表之后的说明仍应正常显示。',
  ].join('\n');

  const entries = [
    {
      type: 'session_meta',
      timestamp: '2026-10-09T08:00:00.000Z',
      payload: { id: SESSION_ID, cwd: PRIMARY_FIXTURE_PROJECT_PATH, model: 'gpt-5-codex' },
    },
    {
      type: 'event_msg',
      timestamp: '2026-10-09T08:00:01.000Z',
      payload: { type: 'user_message', message: '请在聊天记录中显示 PlantUML 图。' },
    },
    {
      type: 'response_item',
      timestamp: '2026-10-09T08:00:02.000Z',
      payload: {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: assistantContent }],
      },
    },
  ];

  await fs.writeFile(
    path.join(sessionDir, `${SESSION_ID}.jsonl`),
    `${entries.map((entry) => JSON.stringify(entry)).join('\n')}\n`,
    'utf8',
  );
}

/**
 * Open the persisted conversation with its Codex provider and workspace parameters.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} sessionId
 * @returns {Promise<void>}
 */
async function openCodexSession(page, sessionId: string): Promise<void> {
  /** Enter the target session directly without depending on home-page selection. */
  const query = new URLSearchParams({
    provider: 'codex',
    projectPath: PRIMARY_FIXTURE_PROJECT_PATH,
  });
  await page.goto(`/session/${sessionId}?${query.toString()}`, { waitUntil: 'networkidle' });
}
