// @ts-nocheck -- Proposal contract test uses browser-injected WebSocket runtime events.
/**
 * Verify first-turn Codex live responses, command cards, and
 * JSONL convergence preserve order without a visible Output summary row.
 */
import { expect, test } from '@playwright/test';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  authHeaders,
  authenticatePage,
  getFixtureProject,
  openFixtureProject,
  PRIMARY_FIXTURE_PROJECT_PATH,
} from './helpers/spec-test-helpers.ts';
import { openCodexFixtureRoute, waitForCodexFixtureSession } from './helpers/fixture-session-discovery.ts';
import { expandTranscriptDetails } from './helpers/transcript-test-helpers.ts';
import { installProviderRuntimeHarness } from './helpers/provider-runtime-harness.ts';
import { getProjectLocalConfigPath } from '../../backend/project-config-store.ts';
import {
  appendCodexSessionEntries,
  codexAssistantMessageEntry,
  codexFunctionCallEntry,
  codexFunctionOutputEntry,
  codexUserMessageEntry,
  writeCodexSessionFixture,
} from './helpers/codex-jsonl-fixture.ts';
import {
  ensurePlaywrightFixture,
  PLAYWRIGHT_FIXTURE_HOME,
} from '../e2e/helpers/playwright-fixture.ts';

const EVIDENCE_DIR = path.resolve(process.cwd(), 'test-results/oz-91-codex-first-turn-rendering');
const LIVE_REFRESH_DEBUG_DIR = path.resolve(process.cwd(), 'test-results/browser-evidence/20260618-1024-live-reply-refresh/screenshots');
const SESSION_DAY = ['2026', '06', '09'];

/**
 * Build a user message row in Codex JSONL event shape.
 *
 * @param {string} timestamp
 * @param {string} text
 * @returns {Record<string, unknown>}
 */
function userEvent(timestamp, text) {
  /** event_msg/user_message is a genuine source of user bubbles. */
  return codexUserMessageEntry(timestamp, text);
}

/**
 * Build a visible assistant text row.
 *
 * @param {string} timestamp
 * @param {string} text
 * @returns {Record<string, unknown>}
 */
function assistantMessage(timestamp, text) {
  /** output_text exercises prose restoration from Codex JSONL. */
  return codexAssistantMessageEntry(timestamp, text);
}

/**
 * Build a Codex function_call row for a command tool.
 *
 * @param {string} timestamp
 * @param {string} callId
 * @param {string} command
 * @returns {Record<string, unknown>}
 */
function commandToolCall(timestamp, callId, command) {
  /** functions.exec_command exposes command-card Output-row regressions clearly. */
  return codexFunctionCallEntry(timestamp, callId, 'functions.exec_command', { cmd: command, yield_time_ms: 5000 });
}

/**
 * Build a Codex function_call_output row for a command tool.
 *
 * @param {string} timestamp
 * @param {string} callId
 * @param {string} output
 * @returns {Record<string, unknown>}
 */
function commandToolOutput(timestamp, callId, output) {
  /** Output for the same call_id completes the original card rather than adding another. */
  return codexFunctionOutputEntry(timestamp, callId, output);
}

/**
 * Build a non-visible lifecycle row.
 *
 * @param {string} timestamp
 * @param {string} type
 * @returns {Record<string, unknown>}
 */
function eventMsg(timestamp, type) {
  /** Lifecycle rows occur in real JSONL but must not create chat bubbles. */
  return {
    type: 'event_msg',
    timestamp,
    payload: { type },
  };
}

/**
 * Install a deterministic WebSocket transport while keeping real UI and APIs.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
async function installCodexSocketHarness(page) {
  await installProviderRuntimeHarness(page, {
    sentKey: '__oz91SentMessages',
    eventsKey: '__oz91RuntimeMessages',
    socketKey: '__oz91Socket',
    emitKey: '__oz91EmitSocketMessage',
  });
  await page.addInitScript(() => {
    window.localStorage.setItem('selected-provider', 'codex');
    window.localStorage.setItem('userLanguage', 'zh-CN');
  });
}

/**
 * Capture browser noise so the acceptance result is not hiding runtime failures.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {{ consoleErrors: string[], pageErrors: string[], ignoredRequestAborts: string[], failedRequests: string[] }}
 */
function attachNoiseRecorder(page) {
  /** Passing business assertions is insufficient if the browser reports errors. */
  const recorder = {
    consoleErrors: [],
    pageErrors: [],
    ignoredRequestAborts: [],
    failedRequests: [],
  };

  page.on('console', (message) => {
    if (message.type() === 'error') {
      recorder.consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    recorder.pageErrors.push(error.message);
  });
  page.on('requestfailed', (request) => {
    const failure = request.failure()?.errorText || 'unknown failure';
    if (failure === 'net::ERR_ABORTED') {
      recorder.ignoredRequestAborts.push(`${request.method()} ${request.url()} ${failure}`);
      return;
    }
    recorder.failedRequests.push(`${request.method()} ${request.url()} ${failure}`);
  });

  return recorder;
}

/**
 * Wait until the project API publishes the fixture Codex session.
 *
 * @param {import('@playwright/test').APIRequestContext} request
 * @param {string} sessionId
 * @returns {Promise<{ project: Record<string, unknown>, session: Record<string, unknown> }>}
 */
async function getFixtureProjectWithCodexSession(request, sessionId) {
  /** Wait for asynchronous discovery through the real project API before opening cN. */
  return waitForCodexFixtureSession(request, sessionId);
}

/**
 * Open the real project cN route for the generated Codex fixture session.
 *
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').APIRequestContext} request
 * @param {string} sessionId
 * @returns {Promise<{ routeSessionId: string, providerSessionId: string }>}
 */
async function openManualCodexRoute(page, request, sessionId) {
  /** Users navigate a project-local cN route rather than a raw provider UUID. */
  const route = await openCodexFixtureRoute(page, request, sessionId);
  return {
    routeSessionId: route.routeSessionId,
    providerSessionId: route.providerSessionId,
  };
}

/**
 * Submit one prompt through the visible chat composer.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} text
 * @returns {Promise<void>}
 */
async function submitUserMessage(page, text) {
  /** Send through the actual textarea so application code creates the optimistic row. */
  const textarea = page.locator('textarea').first();
  await textarea.fill(text);
  await textarea.press('Control+Enter');
  await expect(page.locator('.chat-message.user').filter({ hasText: text })).toHaveCount(1);
}

/**
 * Return the codex-command sent by the real composer for the prompt.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} prompt
 * @returns {Promise<Record<string, unknown>>}
 */
async function waitForCodexCommand(page, prompt) {
  /** Prove submission follows the composer path instead of constructing React state. */
  await expect.poll(async () => page.evaluate((expectedPrompt) => {
    const messages = window.__oz91SentMessages || [];
    const command = messages.find((message) => (
      message && typeof message === 'object' && message.type === 'codex-command' && message.command === expectedPrompt
    ));
    return command?.clientRequestId || '';
  }, prompt), { timeout: 5000 }).not.toBe('');

  return page.evaluate((expectedPrompt) => {
    const messages = window.__oz91SentMessages || [];
    return messages.find((message) => (
      message && typeof message === 'object' && message.type === 'codex-command' && message.command === expectedPrompt
    ));
  }, prompt);
}

/**
 * Emit one route-scoped Codex WebSocket message.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} routeSessionId
 * @param {Record<string, unknown>} message
 * @returns {Promise<void>}
 */
async function emitCodexSocketMessage(page, routeSessionId, message) {
  /** All runtime events carry cN identity so unscoped messages cannot falsely pass. */
  await page.evaluate((payload) => {
    window.__oz91EmitSocketMessage?.(payload);
  }, {
    provider: 'codex',
    sessionId: routeSessionId,
    agentporchSessionId: routeSessionId,
    agentporch_session_id: routeSessionId,
    projectPath: PRIMARY_FIXTURE_PROJECT_PATH,
    ...message,
  });
}

/**
 * Emit one global project-list invalidation through the browser socket harness.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
async function emitProjectListInvalidated(page) {
  /** Reproduce project invalidation after backend provider binding completes. */
  await page.evaluate((projectPath) => {
    window.__oz91EmitSocketMessage?.({
      type: 'project_list_invalidated',
      reason: 'manual-session-provider-bound',
      changedProjectPath: projectPath,
      scope: 'projects:list',
      version: String(Date.now()),
    });
  }, PRIMARY_FIXTURE_PROJECT_PATH);
}

/**
 * Read visible chat rows in DOM order.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Array<{ key: string, text: string }>>}
 */
async function readChatRows(page) {
  /** Acceptance follows the actual DOM order visible to the user. */
  return page.locator('.chat-message').evaluateAll((rows) =>
    rows.map((row) => ({
      key: row.getAttribute('data-message-key') || '',
      text: (row.textContent || '').replace(/\s+/g, ' ').trim(),
    })).filter((row) => row.text),
  );
}

/**
 * Check whether expected texts appear in increasing chat row order.
 *
 * @param {Array<{ text: string }>} rows
 * @param {string[]} expectedTexts
 * @returns {boolean}
 */
function rowsContainInOrder(rows, expectedTexts) {
  /** Assert business-text order without depending on avatars, timestamps, or styling. */
  let searchFrom = 0;
  for (const expectedText of expectedTexts) {
    const foundIndex = rows.findIndex((row, index) => index >= searchFrom && row.text.includes(expectedText));
    if (foundIndex < 0) {
      return false;
    }
    searchFrom = foundIndex + 1;
  }
  return true;
}

/**
 * Count visible chat rows containing a specific text.
 *
 * @param {Array<{ text: string }>} rows
 * @param {string} text
 * @returns {number}
 */
function countRowsContaining(rows, text) {
  /** User messages and command cards appear exactly once; duplicates indicate failed merging. */
  return rows.filter((row) => row.text.includes(text)).length;
}

/**
 * Assert a command card uses icon-only output toggle and remains inspectable.
 *
 * @param {import('@playwright/test').Locator} card
 * @param {string} output
 * @returns {Promise<void>}
 */
async function expectCommandOutputIconOnly(card, output) {
  /** Hide the visible Output summary while preserving expansion and actual output. */
  await expect(card.locator('summary').filter({ hasText: /^\s*Output\s*$/ })).toHaveCount(0);
  const outputToggle = card.locator('[aria-label="Show output"], [aria-label="Hide output"]').first();
  await expect(outputToggle).toBeVisible();
  const outputBlock = card.locator('pre').filter({ hasText: output }).first();
  if (!(await outputBlock.isVisible().catch(() => false))) {
    await outputToggle.click();
  }
  await expect(outputBlock).toBeVisible();
  await expect(card.locator('[id^="tool-result-"], span[id^="tool-result-"]').first()).toHaveCount(1);
}

/**
 * Persist screenshots and browser state snapshots for QA review.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} screenshotName
 * @param {Record<string, unknown>} recorder
 * @returns {Promise<void>}
 */
async function saveEvidence(page, screenshotName, recorder) {
  /** Screenshots support review; JSON records order, WebSocket events, and browser noise. */
  await fs.mkdir(EVIDENCE_DIR, { recursive: true });
  await page.screenshot({ path: path.join(EVIDENCE_DIR, `${screenshotName}.png`), fullPage: true });

  const rows = await readChatRows(page);
  const cards = await page.getByTestId('codex-tool-card').evaluateAll((nodes) =>
    nodes.map((node) => ({
      text: (node.textContent || '').replace(/\s+/g, ' ').trim(),
      outputSummaryCount: [...node.querySelectorAll('summary')]
        .filter((summary) => (summary.textContent || '').trim() === 'Output').length,
      resultAnchorCount: node.querySelectorAll('[id^="tool-result-"]').length,
    })),
  );
  const wsState = await page.evaluate(() => ({
    sentMessages: window.__oz91SentMessages || [],
    runtimeMessages: window.__oz91RuntimeMessages || [],
    location: window.location.href,
  }));

  const transcriptPath = path.join(EVIDENCE_DIR, 'transcript-state.json');
  let transcriptState = {};
  try {
    transcriptState = JSON.parse(await fs.readFile(transcriptPath, 'utf8'));
  } catch {
    transcriptState = {};
  }
  transcriptState[screenshotName] = { rows, cards };

  await fs.writeFile(transcriptPath, `${JSON.stringify(transcriptState, null, 2)}\n`, 'utf8');
  await fs.writeFile(path.join(EVIDENCE_DIR, 'ws-messages.json'), `${JSON.stringify(wsState, null, 2)}\n`, 'utf8');
  await fs.writeFile(path.join(EVIDENCE_DIR, 'console-network.json'), `${JSON.stringify(recorder, null, 2)}\n`, 'utf8');
}

/**
 * Assert the browser did not hide runtime failures during the contract flow.
 *
 * @param {Record<string, string[]>} recorder
 */
function expectNoRuntimeNoise(recorder) {
  /** Unexplained browser errors invalidate UI evidence. */
  const unexpectedConsoleErrors = recorder.consoleErrors.filter((message) => (
    !message.includes('Error fetching slash commands: TypeError: Failed to fetch')
    && !message.includes('Failed to load Codex model catalog: TypeError: Failed to fetch')
  ));
  expect(unexpectedConsoleErrors, 'browser console errors').toEqual([]);
  expect(recorder.pageErrors, 'browser page errors').toEqual([]);
  expect(recorder.failedRequests, 'failed browser requests').toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await fs.mkdir(EVIDENCE_DIR, { recursive: true });
  ensurePlaywrightFixture({ preserveAuthDatabase: true });
  await authenticatePage(page);
  await installCodexSocketHarness(page);
});

test('Codex first persisted turn keeps command order, output toggles, and no duplicate echoes', async ({ page, request }) => {
  const sessionId = 'oz91-codex-first-turn-rendering';
  const prompt = 'Inspect the workflow command and hostname';
  const commentary = 'Preparing the two command checks';
  const finalText = 'Both checks completed';
  const command = 'command -v oz';
  const secondCommand = 'cat /etc/hostname';
  await writeCodexSessionFixture({
    sessionId, projectPath: PRIMARY_FIXTURE_PROJECT_PATH, sessionDay: SESSION_DAY,
    homeDir: PLAYWRIGHT_FIXTURE_HOME, timestamp: '2026-06-09T09:10:00.000Z',
    entries: [
      userEvent('2026-06-09T09:10:01.000Z', prompt),
      assistantMessage('2026-06-09T09:10:02.000Z', commentary),
      commandToolCall('2026-06-09T09:10:03.000Z', 'first-command', command),
      commandToolOutput('2026-06-09T09:10:04.000Z', 'first-command', '/fixture/bin/oz'),
      commandToolCall('2026-06-09T09:10:05.000Z', 'second-command', secondCommand),
      commandToolOutput('2026-06-09T09:10:06.000Z', 'second-command', 'fixture-host'),
      assistantMessage('2026-06-09T09:10:07.000Z', finalText),
      eventMsg('2026-06-09T09:10:08.000Z', 'task_complete'),
    ],
  });
  const route = await openManualCodexRoute(page, request, sessionId);
  const transcript = page.getByTestId('chat-scroll-container').last();
  for (const reload of [false, true]) {
    if (reload) await page.reload({ waitUntil: 'networkidle' });
    await expandTranscriptDetails(page);
    await expect(page.locator('textarea.chat-input-placeholder')).toHaveCount(0);
    for (const text of [prompt, commentary, finalText]) {
      await expect(transcript.getByText(text, { exact: true })).toHaveCount(1);
    }
    const cards = transcript.getByTestId('codex-tool-card');
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(0)).toContainText(command);
    await expect(cards.nth(1)).toContainText(secondCommand);
    await expectCommandOutputIconOnly(cards.nth(0), '/fixture/bin/oz');
    await expectCommandOutputIconOnly(cards.nth(1), 'fixture-host');
    await emitCodexSocketMessage(page, route.routeSessionId, {
      type: 'codex-response', data: { type: 'item', itemType: 'agent_message',
        message: { role: 'assistant', phase: 'final', content: finalText } },
    });
    await expect(transcript.getByText(finalText, { exact: true })).toHaveCount(1);
  }
});

test('Codex provider binding and project invalidation preserve the saved reply on its cN route', async ({ page, request }) => {
  const providerSessionId = 'oz91-bound-saved-provider';
  const reply = 'Saved response remains available after provider binding';
  await writeCodexSessionFixture({
    sessionId: providerSessionId, projectPath: PRIMARY_FIXTURE_PROJECT_PATH,
    sessionDay: SESSION_DAY, homeDir: PLAYWRIGHT_FIXTURE_HOME,
    timestamp: '2026-06-09T09:20:00.000Z',
    entries: [userEvent('2026-06-09T09:20:01.000Z', 'Inspect current state'),
      assistantMessage('2026-06-09T09:20:02.000Z', reply)],
  });
  const route = await openManualCodexRoute(page, request, providerSessionId);
  const project = await getFixtureProject(request);
  const transcript = page.getByTestId('chat-scroll-container').last();
  await expect(transcript).toContainText(reply);
  const response = await request.post(
    `/api/projects/${encodeURIComponent(project.name)}/manual-sessions/${route.routeSessionId}/finalize`,
    { headers: authHeaders(), data: { actualSessionId: providerSessionId, provider: 'codex', projectPath: PRIMARY_FIXTURE_PROJECT_PATH } },
  );
  expect(response.ok()).toBeTruthy();
  await emitProjectListInvalidated(page);
  await expect(transcript.getByText(reply, { exact: true })).toHaveCount(1);
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page).toHaveURL(new RegExp(`/${route.routeSessionId}$`));
  await expect(transcript.getByText(reply, { exact: true })).toHaveCount(1);
  await expect(page.locator('textarea.chat-input-placeholder')).toHaveCount(0);
});

test('Codex cN route 消息刷新保持 route-scoped 加载入口', async ({ page, request }) => {
  /**
   * Scenario: Opening a manual cN session recovers its running response through
   * route-scoped messages merged with the active-turn overlay; resolving the provider UUID
   * in overview must not switch the frontend to the raw provider message endpoint.
   */
  const recorder = attachNoiseRecorder(page);
  const sessionId = `oz91-route-scoped-loader-${Date.now()}`;
  const persistedUser = '91 cN route loader：用户已进入 provider-backed Manual sessions。';
  const persistedAssistant = '91 cN route loader：历史消息通过 cN route 加载。';
  const messageRequests = [];

  await writeCodexSessionFixture({
    sessionId,
    projectPath: PRIMARY_FIXTURE_PROJECT_PATH,
    sessionDay: SESSION_DAY,
    homeDir: PLAYWRIGHT_FIXTURE_HOME,
    timestamp: '2026-06-09T09:30:00.000Z',
    entries: [
      userEvent('2026-06-09T09:30:01.000Z', persistedUser),
      assistantMessage('2026-06-09T09:30:02.000Z', persistedAssistant),
    ],
  });
  const configPath = getProjectLocalConfigPath(PRIMARY_FIXTURE_PROJECT_PATH);
  const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
  const chat = Object.fromEntries(
    Object.entries(config.chat || {}).filter(([, record]) => record?.sessionId !== sessionId),
  ) as Record<string, Record<string, unknown>>;
  const routeIndex = Math.max(
    0,
    ...Object.keys(chat).map((key) => Number(key)).filter((value) => Number.isInteger(value) && value > 0),
  ) + 1;
  const routeSessionId = `c${routeIndex}`;
  config.chat = chat;
  chat[String(routeIndex)] = {
    sessionId,
    providerSessionId: sessionId,
    provider: 'codex',
    title: 'Codex route-scoped loader',
  };
  await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');

  page.on('request', (pageRequest) => {
    const url = pageRequest.url();
    if (url.includes('/messages')) {
      messageRequests.push(url);
    }
  });

  const project = await getFixtureProject(request);
  const route = {
    project,
    session: config.chat[String(routeIndex)],
    routeSessionId,
    providerSessionId: sessionId,
  };
  await openFixtureProject(page, { reset: false });
  await page.goto(`${project.routePath}/${routeSessionId}`, { waitUntil: 'domcontentloaded' });
  const transcript = page.locator('[data-testid="chat-scroll-container"]').last();
  await expect(transcript).toContainText(persistedAssistant);
  await page.waitForTimeout(1200);

  const routeScopedRequests = messageRequests.filter((url) => url.includes(`/sessions/${route.routeSessionId}/messages`));
  const providerScopedRequests = messageRequests.filter((url) => url.includes(`/api/codex/sessions/${sessionId}/messages`));
  await fs.writeFile(
    path.join(EVIDENCE_DIR, 'route-scoped-message-requests.json'),
    `${JSON.stringify({ route, messageRequests, routeScopedRequests, providerScopedRequests }, null, 2)}\n`,
    'utf8',
  );

  expect(routeScopedRequests.length, 'cN route must request route-scoped messages').toBeGreaterThan(0);
  expect(providerScopedRequests, 'cN route must not bypass active-turn overlay with provider UUID messages API').toEqual([]);
  await saveEvidence(page, 'route-scoped-loader', recorder);
});
