// @ts-nocheck -- Browser fixtures use injected runtime globals.
/** Verify completed provider batches, saved reasoning summaries, and empty tool output rendering after reload. */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { ensurePlaywrightFixture } from '../e2e/helpers/playwright-fixture.ts';
import {
  PRIMARY_FIXTURE_PROJECT_PATH,
  authenticatePage,
} from './helpers/spec-test-helpers.ts';
import { openCodexFixtureRoute, waitForCodexFixtureSession } from './helpers/fixture-session-discovery.ts';
import { expandTranscriptDetails } from './helpers/transcript-test-helpers.ts';
import { installProviderRuntimeHarness } from './helpers/provider-runtime-harness.ts';
import {
  appendCodexSessionEntries,
  codexAssistantMessageEntry,
  codexFunctionCallEntry,
  codexFunctionOutputEntry,
  codexUserMessageEntry,
  writeCodexSessionFixture,
} from './helpers/codex-jsonl-fixture.ts';

const EVIDENCE_DIR = path.resolve(process.cwd(), 'test-results/proposal-92-provider-non-streaming-render');

test.describe.configure({ mode: 'serial' });
test.use({ trace: 'off', video: 'off', screenshot: 'off' });

async function installCodexSocketHarness(page) {
  await installProviderRuntimeHarness(page, {
    sentKey: '__p92SentMessages',
    eventsKey: '__p92RuntimeMessages',
    socketKey: '__p92Socket',
    emitKey: '__p92EmitSocketMessage',
  });
  await page.addInitScript(() => {
    window.__agentporchActiveChatSocket = null;
    window.localStorage.setItem('selected-provider', 'codex');
    window.localStorage.setItem('userLanguage', 'zh-CN');
  });
}

async function emitCodexSocketMessage(page, routeSessionId, message) {
  await page.evaluate((payload) => {
    window.__p92EmitSocketMessage?.(payload);
  }, {
    provider: 'codex',
    sessionId: routeSessionId,
    agentporchSessionId: routeSessionId,
    agentporch_session_id: routeSessionId,
    projectPath: PRIMARY_FIXTURE_PROJECT_PATH,
    ...message,
  });
}

async function openManualCodexRoute(page, request, sessionId) {
  const route = await waitForCodexFixtureSession(request, sessionId, { intervalMs: 500 });
  const routePrefix = String(route.project.routePath || `/projects/${encodeURIComponent(String(route.project.name))}`);
  await page.goto(`${routePrefix}/${route.routeSessionId}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-testid="chat-scroll-container"]')).toBeVisible();
  await expect(page.locator('textarea.chat-input-placeholder')).toHaveCount(0);
  return { routeSessionId: route.routeSessionId, providerSessionId: route.providerSessionId };
}

async function submitUserMessage(page, text) {
  const textarea = page.locator('textarea').first();
  await textarea.fill(text);
  await textarea.press('Control+Enter');
  if (await page.locator('.chat-message.user').filter({ hasText: text }).count() === 0) {
    await textarea.press('Meta+Enter');
  }
  await expect(page.locator('.chat-message.user').filter({ hasText: text })).toHaveCount(1);
}

async function saveScreenshot(page, name) {
  await fs.mkdir(EVIDENCE_DIR, { recursive: true });
  await page.screenshot({ path: path.join(EVIDENCE_DIR, `${name}.png`), fullPage: false });
}

async function saveConsoleLogs(page) {
  const logs = [];
  page.on('console', (msg) => {
    logs.push({ type: msg.type(), text: msg.text() });
  });
  page.on('pageerror', (err) => {
    logs.push({ type: 'pageerror', text: err.message });
  });
  // Return a flush function
  return async () => {
    await fs.mkdir(EVIDENCE_DIR, { recursive: true });
    await fs.writeFile(
      path.join(EVIDENCE_DIR, 'console.json'),
      `${JSON.stringify({ capturedAt: new Date().toISOString(), logs }, null, 2)}\n`,
      'utf8',
    );
  };
}

test('Codex saved batches render completed text, reasoning, and empty tool outputs after reload', async ({ page, request }) => {
  ensurePlaywrightFixture({ preserveAuthDatabase: true });
  await authenticatePage(page);
  await installCodexSocketHarness(page);
  const sessionId = 'proposal-92-codex-non-streaming';
  const sessionDay = ['2026', '06', '09'];
  const homeDir = process.env.PLAYWRIGHT_FIXTURE_HOME || process.env.HOME;
  await writeCodexSessionFixture({
    sessionId, projectPath: PRIMARY_FIXTURE_PROJECT_PATH, sessionDay, homeDir,
    timestamp: '2026-06-09T01:00:00.000Z',
    entries: [
      codexUserMessageEntry('2026-06-09T01:00:00.100Z', 'Inspect command results'),
      { type: 'response_item', timestamp: '2026-06-09T01:00:00.200Z', payload: {
        type: 'reasoning', summary: [{ type: 'summary_text', text: 'Completed reasoning summary' }],
        encrypted_content: 'not-visible-encrypted-reasoning',
      } },
      codexFunctionCallEntry('2026-06-09T01:00:01.000Z', 'p92-tool-call', 'functions.exec_command', { cmd: 'printf proposal-92-tool-output' }),
      codexFunctionOutputEntry('2026-06-09T01:00:02.000Z', 'p92-tool-call', 'proposal-92-tool-output'),
      codexFunctionCallEntry('2026-06-09T01:00:03.000Z', 'p92-empty-tool', 'functions.exec_command', { cmd: 'true' }),
      codexFunctionOutputEntry('2026-06-09T01:00:04.000Z', 'p92-empty-tool', ''),
      codexAssistantMessageEntry('2026-06-09T01:00:05.000Z', 'Completed assistant response'),
    ],
  });
  const { routeSessionId } = await openManualCodexRoute(page, request, sessionId);
  const transcript = page.getByTestId('chat-scroll-container').last();
  for (const reload of [false, true]) {
    if (reload) await page.reload({ waitUntil: 'networkidle' });
    await expandTranscriptDetails(page);
    await expect(transcript.getByText('Completed assistant response', { exact: true })).toHaveCount(1);
    await expect(transcript).toContainText('Completed reasoning summary');
    await expect(transcript).not.toContainText('not-visible-encrypted-reasoning');
    const cards = transcript.getByTestId('codex-tool-card');
    await expect(cards).toHaveCount(2);
    const outputCard = cards.filter({ hasText: 'printf proposal-92-tool-output' });
    await expect(outputCard).toHaveCount(1);
    await outputCard.getByRole('button', { name: 'Show output' }).click();
    await expect(outputCard.locator('#tool-result-p92-tool-call pre')).toContainText('proposal-92-tool-output');
    const emptyCard = cards.filter({ hasText: /^true$/ });
    await expect(emptyCard).toBeVisible();
    await expect(emptyCard.locator('[id^="tool-result-"] pre')).toHaveCount(0);
    await expect(emptyCard.locator('summary').filter({ hasText: /^Output$/i })).toHaveCount(0);
    await emitCodexSocketMessage(page, routeSessionId, {
      type: 'codex-response', data: { type: 'item', itemType: 'agent_message',
        status: 'in_progress', delta: { text: 'Obsolete partial delta' }, message: { role: 'assistant' } },
    });
    await expect(transcript.getByText('Completed assistant response', { exact: true })).toHaveCount(1);
    await expect(transcript).not.toContainText('Obsolete partial delta');
  }
  await saveScreenshot(page, 'saved-batch-after-reload');
});
