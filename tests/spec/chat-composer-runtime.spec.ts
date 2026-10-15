// @ts-nocheck -- Browser fixtures use injected runtime globals.
/** Verify read-only Render input isolation, stable saved snapshots, and image/text/diff previews from persisted tool cards. */
import { expect, test } from '@playwright/test';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { expandTranscriptDetails } from './helpers/transcript-test-helpers.ts';
import {
  authenticatePage,
  openFixtureProject,
  PRIMARY_FIXTURE_PROJECT_PATH,
} from './helpers/spec-test-helpers.ts';
import {
  bindCodexFixtureManualRoute,
  codexFunctionCallEntry,
  codexFunctionOutputEntry,
} from './helpers/codex-jsonl-fixture.ts';
import { installProviderRuntimeHarness } from './helpers/provider-runtime-harness.ts';
import { PLAYWRIGHT_FIXTURE_PROJECT_PATHS } from '../e2e/helpers/playwright-fixture.ts';

const EVIDENCE_DIR = path.resolve(process.cwd(), 'test-results', 'spec-chat-composer-runtime');
const ACTIVE_TURN_EVIDENCE_DIR = path.resolve(process.cwd(), 'test-results', 'active-turn-indicator');
const SAMPLEAPP_PROJECT_PATH = PLAYWRIGHT_FIXTURE_PROJECT_PATHS.find((projectPath) =>
  projectPath.endsWith(`${path.sep}workspace${path.sep}sampleapp`),
) || path.join(path.dirname(PRIMARY_FIXTURE_PROJECT_PATH), 'sampleapp');
const VIEW_IMAGE_SESSION_ID = 'codex-view-image-tool-link';
const VIEW_IMAGE_RELATIVE_PATH = 'images/view-image-tool-link.png';
const READ_TOOL_SESSION_ID = 'codex-read-tool-link';
const READ_TOOL_RELATIVE_PATH = 'src/read-tool-link.ts';
const EDIT_TOOL_SESSION_ID = 'codex-edit-tool-link';
const EDIT_TOOL_RELATIVE_PATH = 'src/edit-tool-link.ts';
const FILE_CHANGES_TOOL_SESSION_ID = 'codex-file-changes-tool-link';
const FILE_CHANGES_TOOL_RELATIVE_PATH = 'src/file-changes-tool-link.ts';
const TINY_PNG_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41,
  0x54, 0x78, 0x9c, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
  0x00, 0x03, 0x01, 0x01, 0x00, 0xc9, 0xfe, 0x92,
  0xef, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
  0x44, 0xae, 0x42, 0x60, 0x82,
]);

/**
 * Build a long old/new text pair with one changed line below the initial editor viewport.
 *
 * @param {string} exportName
 * @returns {{oldText: string, newText: string, oldLine: string, newLine: string}}
 */
function buildLongDiffFixture(exportName) {
  const contextBefore = Array.from(
    { length: 70 },
    (_, index) => `export const ${exportName}ContextBefore${index + 1} = ${index + 1};`,
  );
  const contextAfter = Array.from(
    { length: 20 },
    (_, index) => `export const ${exportName}ContextAfter${index + 1} = ${index + 1};`,
  );
  const oldLine = `export const ${exportName} = true;`;
  const newLine = `export const ${exportName} = "edited";`;

  return {
    oldText: `${[...contextBefore, oldLine, ...contextAfter].join('\n')}\n`,
    newText: `${[...contextBefore, newLine, ...contextAfter].join('\n')}\n`,
    oldLine,
    newLine,
  };
}

/**
 * Ensure screenshots and state snapshots can be written by every scenario.
 *
 * @returns {Promise<void>}
 */
async function ensureEvidenceDir() {
  await fs.mkdir(EVIDENCE_DIR, { recursive: true });
  await fs.mkdir(ACTIVE_TURN_EVIDENCE_DIR, { recursive: true });
}

/**
 * Build the same readable project route prefix that the app uses for fixtures.
 *
 * @param {string} projectPath
 * @returns {string}
 */
function buildProjectRoutePrefix(projectPath) {
  const homePath = process.env.HOME || process.env.USERPROFILE || '';
  const relativePath = path.relative(homePath, projectPath).split(path.sep).join('/');
  return `/${relativePath}`;
}

/**
 * Install a deterministic chat runtime while preserving auth, project APIs,
 * route resolution, and React rendering.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
async function installChatRuntimeFixture(page) {
  await installProviderRuntimeHarness(page, {
    sentKey: '__chatRuntimeSharedSentMessages',
    eventsKey: '__chatRuntimeSharedEvents',
    socketKey: '__chatRuntimeSharedSocket',
    emitKey: '__chatRuntimeSharedEmit',
    onSendKey: '__chatRuntimeOnSend',
  });
  await page.addInitScript(() => {
    window.__chatRuntimeSentMessages = window.__chatRuntimeSharedSentMessages || [];
    window.__chatRuntimeEvents = window.__chatRuntimeSharedEvents || [];
    window.__chatRuntimeEmit = window.__chatRuntimeSharedEmit;
    window.localStorage.setItem('selected-provider', 'codex');
    window.localStorage.setItem('userLanguage', 'zh-CN');
    window.localStorage.removeItem('uiPreferences');
    window.localStorage.removeItem('sendByCtrlEnter');
    window.localStorage.removeItem('codex-service-tier');
    const activeTurnStartedAtKey = '__chatRuntime:c73:turnStartedAt';
    const activeCommandSessionsKey = '__chatRuntime:activeCommandSessions';

    const readActiveCommandSessions = () => {
      try {
        return JSON.parse(window.localStorage.getItem(activeCommandSessionsKey) || '{}');
      } catch {
        return {};
      }
    };

    const writeActiveCommandSessions = (sessions) => {
      window.localStorage.setItem(activeCommandSessionsKey, JSON.stringify(sessions));
    };

    const activeCommandTurnStartedAtKey = (sessionId) => `__chatRuntime:${sessionId}:turnStartedAt`;

    const emitRunningStatus = (sessionId, turnId, turnStartedAt) => {
      window.__chatRuntimeEmit?.({
        type: 'session-status',
        provider: 'codex',
        sessionId,
        agentporchSessionId: sessionId,
        agentporch_session_id: sessionId,
        isProcessing: true,
        turnId,
        turn_id: turnId,
        turnStartedAt,
        turn_started_at: turnStartedAt,
      });
    };

    window.__chatRuntimeOnSend = (message) => {
      if (message.type === 'codex-command' || message.type === 'pi-command') {
        const commandSessionId = message.agentporchSessionId || message.agentporch_session_id || message.sessionId;
        if (!commandSessionId) {
          return;
        }
        if (message.clientRequestId) {
          window.__chatRuntimeEmit?.({
            type: 'message-accepted',
            provider: message.provider || 'codex',
            sessionId: commandSessionId,
            agentporchSessionId: commandSessionId,
            agentporch_session_id: commandSessionId,
            clientRequestId: message.clientRequestId,
          });
        }
        const turnStartedAt =
          window.localStorage.getItem(activeCommandTurnStartedAtKey(commandSessionId)) ||
          new Date(Date.now() - 65_000).toISOString();
        const activeCommandSessions = readActiveCommandSessions();
        activeCommandSessions[commandSessionId] = {
          turnId: `turn-${commandSessionId}-sent`,
          turnStartedAt,
        };
        window.localStorage.setItem(activeCommandTurnStartedAtKey(commandSessionId), turnStartedAt);
        writeActiveCommandSessions(activeCommandSessions);
        emitRunningStatus(commandSessionId, activeCommandSessions[commandSessionId].turnId, turnStartedAt);
        return;
      }

      if (message.type !== 'check-session-status') {
        return;
      }

      const requestedRouteSession =
        message.agentporchSessionId ||
        message.agentporch_session_id ||
        (String(message.sessionId || '').match(/^c\d+$/) ? message.sessionId : null);

      if (requestedRouteSession === 'c73') {
        const turnStartedAt =
          window.localStorage.getItem(activeTurnStartedAtKey) ||
          new Date(Date.now() - 65_000).toISOString();
        window.localStorage.setItem(activeTurnStartedAtKey, turnStartedAt);
        window.__chatRuntimeEmit?.({
          type: 'session-status',
          provider: 'codex',
          sessionId: 'provider-session-c73',
          agentporchSessionId: 'c73',
          agentporch_session_id: 'c73',
          isProcessing: true,
          turnId: 'turn-c73-live',
          turn_id: 'turn-c73-live',
          turnStartedAt,
          turn_started_at: turnStartedAt,
        });

        setTimeout(() => {
          window.__chatRuntimeEmit?.({
            type: 'codex-response',
            provider: 'codex',
            sessionId: 'provider-session-c73',
            agentporchSessionId: 'c73',
            agentporch_session_id: 'c73',
            data: {
              type: 'item',
              itemType: 'agent_message',
              itemId: 'agent-message-c73-live',
              message: {
                role: 'assistant',
                content: 'SPEC_C73_LIVE_OUTPUT',
              },
            },
          });
        }, 50);
        return;
      }

      const activeCommandSessions = readActiveCommandSessions();
      if (requestedRouteSession && activeCommandSessions[requestedRouteSession]) {
        const activeTurn = activeCommandSessions[requestedRouteSession];
        emitRunningStatus(requestedRouteSession, activeTurn.turnId, activeTurn.turnStartedAt);
        return;
      }

      window.__chatRuntimeEmit?.({
        type: 'session-status',
        provider: 'codex',
        sessionId: message.sessionId,
        agentporchSessionId: requestedRouteSession,
        isProcessing: false,
      });
    };

    window.__chatRuntimeCompleteSession = (sessionId) => {
      const activeCommandSessions = readActiveCommandSessions();
      delete activeCommandSessions[sessionId];
      writeActiveCommandSessions(activeCommandSessions);
      window.localStorage.removeItem(activeCommandTurnStartedAtKey(sessionId));
      window.__chatRuntimeEmit?.({
        type: 'session-status',
        provider: 'codex',
        sessionId,
        agentporchSessionId: sessionId,
        agentporch_session_id: sessionId,
        isProcessing: false,
      });
    };

    window.__chatRuntimeEmitToolLifecycle = (phase) => {
      const callId = 'chat-runtime-tool-call-1';
      if (phase === 'start') {
        window.__chatRuntimeEmit?.({
          type: 'loading_progress',
          provider: 'codex',
          sessionId: 'provider-session-c73',
          agentporchSessionId: 'c73',
          agentporch_session_id: 'c73',
          phase: 'tool_start',
          current: 1,
          total: 2,
        });
        return;
      }

      window.__chatRuntimeEmit?.({
        type: 'codex-response',
        provider: 'codex',
        sessionId: 'provider-session-c73',
        agentporchSessionId: 'c73',
        agentporch_session_id: 'c73',
        data: {
          type: 'item',
          itemType: 'function_call_output',
          itemId: callId,
          status: 'completed',
          item: {
            type: 'function_call_output',
            call_id: callId,
            output: 'CHAT_RUNTIME_TOOL_OUTPUT\n',
          },
        },
      });
    };
  });
}

/**
 * Return composer commands emitted by the browser.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
async function providerCommands(page) {
  return page.evaluate(() =>
    (window.__chatRuntimeSentMessages || []).filter((message) =>
      message.type === 'codex-command' || message.type === 'pi-command',
    ),
  );
}

/**
 * Persist browser runtime state as a reviewable artifact.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} fileName
 * @returns {Promise<void>}
 */
async function writeBrowserState(page, fileName) {
  const state = await page.evaluate(() => ({
    sentMessages: window.__chatRuntimeSentMessages || [],
    runtimeEvents: window.__chatRuntimeEvents || [],
    location: window.location.href,
  }));
  await fs.writeFile(path.join(EVIDENCE_DIR, fileName), `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

/**
 * Write a real Codex JSONL fixture so the page loads tool cards through the
 * production messages API instead of a route-level mock.
 *
 * @param {object} args
 * @param {string} args.sessionId
 * @param {string} args.userMessage
 * @param {string} args.toolName
 * @param {Record<string, unknown>} args.toolArguments
 * @returns {Promise<string>}
 */
async function writeCodexToolCardFixture({ sessionId, userMessage, toolName, toolArguments }) {
  const playwrightHome = path.resolve(SAMPLEAPP_PROJECT_PATH, '..', '..');
  const sessionDir = path.join(playwrightHome, '.codex', 'sessions', '2026', '06', '15');
  await fs.mkdir(sessionDir, { recursive: true });
  const sessionPath = path.join(sessionDir, `${sessionId}.jsonl`);
  const timestamp = '2026-06-15T12:49:00.000Z';
  const lines = [
    {
      type: 'session_meta',
      timestamp,
      payload: {
        id: sessionId,
        cwd: SAMPLEAPP_PROJECT_PATH,
        model: 'gpt-5-codex',
      },
    },
    {
      type: 'event_msg',
      timestamp,
      payload: {
        type: 'user_message',
        message: userMessage,
      },
    },
    codexFunctionCallEntry('2026-06-15T12:49:01.000Z', `${sessionId}-call`, toolName, toolArguments),
    codexFunctionOutputEntry('2026-06-15T12:49:02.000Z', `${sessionId}-call`, `${toolName} complete`),
  ];
  await fs.writeFile(sessionPath, `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`, 'utf8');
  await bindCodexFixtureManualRoute(sessionId, SAMPLEAPP_PROJECT_PATH, userMessage);
  return sessionPath;
}

/**
 * Write the image fixture asset and JSONL transcript for view_image.
 *
 * @returns {Promise<string>}
 */
async function writeViewImageCodexFixture() {
  const imagePath = path.join(SAMPLEAPP_PROJECT_PATH, VIEW_IMAGE_RELATIVE_PATH);
  await fs.mkdir(path.dirname(imagePath), { recursive: true });
  await fs.writeFile(imagePath, TINY_PNG_BYTES);
  await writeCodexToolCardFixture({
    sessionId: VIEW_IMAGE_SESSION_ID,
    userMessage: 'open generated image from view_image tool card',
    toolName: 'functions.view_image',
    toolArguments: { path: imagePath },
  });
  return imagePath;
}

/**
 * Write a text file plus a Read/Edit tool-card transcript for browser open tests.
 *
 * @param {object} args
 * @param {string} args.sessionId
 * @param {string} args.relativePath
 * @param {string} args.toolName
 * @param {Record<string, unknown>} args.toolArguments
 * @returns {Promise<string>}
 */
async function writeTextToolCodexFixture({ sessionId, relativePath, toolName, toolArguments }) {
  const absolutePath = path.join(SAMPLEAPP_PROJECT_PATH, relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, 'export const toolOpenFile = true;\n', 'utf8');
  await writeCodexToolCardFixture({
    sessionId,
    userMessage: `open ${relativePath} from ${toolName} tool card`,
    toolName,
    toolArguments: { ...toolArguments, file_path: absolutePath },
  });
  return absolutePath;
}

/**
 * Open the primary fixture project's manual chat route.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<import('@playwright/test').Locator>}
 */
async function openFixtureManualChat(page) {
  await openFixtureProject(page);
  await page.getByRole('button', { name: /fixture-project manu/i }).first().click();
  const transcript = page.getByTestId('chat-scroll-container').last();
  await expect(transcript).toBeVisible();
  return transcript;
}

test.beforeEach(async ({ page }) => {
  await ensureEvidenceDir();
  await authenticatePage(page);
  await installChatRuntimeFixture(page);
  await openFixtureProject(page);
});

test('Render ignores Enter shortcuts and cannot submit provider commands', async ({ page }) => {
  const transcript = await openFixtureManualChat(page);
  const before = await transcript.innerText();
  for (const key of ['Enter', 'Control+Enter', 'Meta+Enter']) await page.keyboard.press(key);
  await expect(page.locator('textarea.chat-input-placeholder')).toHaveCount(0);
  expect(await providerCommands(page)).toEqual([]);
  expect(await transcript.innerText()).toBe(before);
});


test('Render does not expose or change provider Fast settings', async ({ page }) => {
  const writes = [];
  page.on('request', request => {
    if (request.method() === 'PUT' && request.url().includes('/model-state')) writes.push(request.url());
  });
  await openFixtureManualChat(page);
  await expect(page.getByTestId('session-fast-toggle')).toHaveCount(0);
  await expect(page.getByTestId('session-model-select')).toHaveCount(0);
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.getByTestId('chat-rendered-snapshot-pane')).toBeVisible();
  expect(writes).toEqual([]);
  expect(await providerCommands(page)).toEqual([]);
});


test('settings no longer expose a sendByCtrlEnter toggle', async ({ page }) => {
  /** Business rule: users cannot re-enable bare Enter sending from settings. */
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /设置|Settings/ }).first().click();

  await expect(page.getByText('使用 Ctrl+Enter 发送')).toHaveCount(0);
  await expect(page.getByText('Send by Ctrl+Enter')).toHaveCount(0);
  await expect(page.getByText(/按 Ctrl\+Enter 发送消息/)).toHaveCount(0);
  await page.screenshot({ path: path.join(EVIDENCE_DIR, 'settings-no-shortcut-toggle.png'), fullPage: true });
});

test('Render preserves saved text when unrelated running-status events arrive', async ({ page }) => {
  const transcript = await openFixtureManualChat(page);
  await expect(transcript).toContainText('fixture-project manual-only session');
  await page.evaluate(() => window.__chatRuntimeEmit?.({
    type: 'session-status', provider: 'codex', sessionId: 'c73', agentporchSessionId: 'c73', isProcessing: true,
  }));
  await expect(page.getByRole('button', { name: /停止|stop/i })).toHaveCount(0);
  await expect(transcript).toContainText('fixture-project manual-only session');
  expect(await providerCommands(page)).toEqual([]);
});


test('scrolling saved history does not submit commands or reload its messages', async ({ page }) => {
  let reads = 0;
  page.on('request', request => { if (request.url().includes('/messages')) reads += 1; });
  const transcript = await openFixtureManualChat(page);
  // Initial viewport calibration may fetch the remaining history page. Count
  // scroll-triggered reads only after this finite bootstrap has completed.
  await expect(page.getByTestId('chat-rendered-snapshot-pane')).toHaveAttribute('data-history-prefetch-state', 'exhausted');
  const before = reads;
  await transcript.evaluate(element => { element.scrollTop = element.scrollHeight; });
  await expect(transcript).toContainText('fixture-project manual-only session');
  // Observe the deferred scroll handlers rather than checking synchronously.
  await page.waitForTimeout(500);
  expect(reads).toBe(before);
  expect(await providerCommands(page)).toEqual([]);
  await expect(page.getByTestId('chat-follow-latest')).toHaveCount(0);
});


test('a saved completed command renders one expandable output card', async ({ page }) => {
  const sessionId = 'saved-command-output-card';
  await writeCodexToolCardFixture({ sessionId, userMessage: 'Inspect saved command', toolName: 'functions.exec_command', toolArguments: { cmd: 'printf saved-output' } });
  await page.goto(`/session/${sessionId}?${new URLSearchParams({ provider: 'codex', projectPath: SAMPLEAPP_PROJECT_PATH })}`, { waitUntil: 'networkidle' });
  await expandTranscriptDetails(page);
  const card = page.getByTestId('codex-tool-card').filter({ hasText: 'printf saved-output' });
  await expect(card).toHaveCount(1);
  await card.getByRole('button', { name: 'Show output' }).click();
  await expect(card.locator('[id^="tool-result-"] pre')).toContainText('functions.exec_command complete');
});


test('view_image tool card path opens the image preview', async ({ page }) => {
  /** Business rule: a generated image path in a view_image tool card is a direct workspace file link. */
  await writeViewImageCodexFixture();
  const sampleappRoute = `/session/${VIEW_IMAGE_SESSION_ID}?${new URLSearchParams({ provider: 'codex', projectPath: SAMPLEAPP_PROJECT_PATH })}`;
  await page.goto(sampleappRoute, { waitUntil: 'networkidle' });
  await expandTranscriptDetails(page);

  const imagePathButton = page.getByRole('button', { name: VIEW_IMAGE_RELATIVE_PATH });
  await expect(imagePathButton).toBeVisible();
  await imagePathButton.click();
  await expect(page.getByRole('img', { name: path.basename(VIEW_IMAGE_RELATIVE_PATH) })).toBeVisible();
  await page.screenshot({ path: path.join(EVIDENCE_DIR, 'view-image-tool-link-opened.png'), fullPage: true });
});

test('Read tool card path opens the text editor', async ({ page }) => {
  /** Business rule: Read file paths use the same workspace file-open flow as image tools. */
  await writeTextToolCodexFixture({
    sessionId: READ_TOOL_SESSION_ID,
    relativePath: READ_TOOL_RELATIVE_PATH,
    toolName: 'Read',
    toolArguments: {},
  });
  const sampleappRoute = `/session/${READ_TOOL_SESSION_ID}?${new URLSearchParams({ provider: 'codex', projectPath: SAMPLEAPP_PROJECT_PATH })}`;
  await page.goto(sampleappRoute, { waitUntil: 'networkidle' });
  await expandTranscriptDetails(page);

  const openReadButton = page.getByRole('button', { name: `Open ${READ_TOOL_RELATIVE_PATH}` });
  await expect(openReadButton).toBeVisible();
  await openReadButton.click();
  await expect(
    page.getByTestId('workspace-dock-layout').getByRole('heading', { name: path.basename(READ_TOOL_RELATIVE_PATH) }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /^(Save|保存)$/i })).toBeVisible();
  await page.screenshot({ path: path.join(EVIDENCE_DIR, 'read-tool-link-opened.png'), fullPage: true });
});

test('Edit tool card path opens diff context in the text editor', async ({ page }) => {
  /** Business rule: Edit cards open the target file while carrying the old/new diff context. */
  const diffFixture = buildLongDiffFixture('toolOpenFile');
  await writeTextToolCodexFixture({
    sessionId: EDIT_TOOL_SESSION_ID,
    relativePath: EDIT_TOOL_RELATIVE_PATH,
    toolName: 'Edit',
    toolArguments: {
      old_string: diffFixture.oldText,
      new_string: diffFixture.newText,
    },
  });
  const sampleappRoute = `/session/${EDIT_TOOL_SESSION_ID}?${new URLSearchParams({ provider: 'codex', projectPath: SAMPLEAPP_PROJECT_PATH })}`;
  await page.goto(sampleappRoute, { waitUntil: 'networkidle' });
  await expandTranscriptDetails(page);

  const openEditButton = page.getByRole('button', { name: `Open ${EDIT_TOOL_RELATIVE_PATH}` });
  await expect(openEditButton).toBeVisible();
  await openEditButton.click();
  await expect(
    page.getByTestId('workspace-dock-layout').getByRole('heading', { name: path.basename(EDIT_TOOL_RELATIVE_PATH) }),
  ).toBeVisible();
  await expect(page.getByText('显示更改')).toBeVisible();
  await expect(page.getByTestId('workspace-dock-layout').locator('.cm-editor.cm-merge-b')).toBeVisible();
  await expect(page.getByTestId('workspace-dock-layout').locator('.cm-changedLine').filter({ hasText: diffFixture.newLine }).first()).toBeVisible();
  await expect(page.getByText(diffFixture.oldLine).first()).toBeVisible();
  await expect(page.getByText(diffFixture.newLine).first()).toBeVisible();
  await page.getByTestId('workspace-dock-layout').getByRole('button', { name: /关闭|Close/i }).click();

  const editToolCard = page.getByTestId('codex-tool-card').filter({ hasText: EDIT_TOOL_RELATIVE_PATH });
  await expect(editToolCard.locator('summary').filter({ hasText: /^Output$/ })).toHaveCount(0);
  await editToolCard.getByRole('button', { name: `Open ${EDIT_TOOL_RELATIVE_PATH}` }).click();
  await expect(
    page.getByTestId('workspace-dock-layout').getByRole('heading', { name: path.basename(EDIT_TOOL_RELATIVE_PATH) }),
  ).toBeVisible();
  await expect(page.getByText('显示更改')).toBeVisible();
  await expect(page.getByTestId('workspace-dock-layout').locator('.cm-editor.cm-merge-b')).toBeVisible();
  await expect(page.getByTestId('workspace-dock-layout').locator('.cm-changedLine').filter({ hasText: diffFixture.newLine }).first()).toBeVisible();
  await expect(page.getByText(diffFixture.oldLine).first()).toBeVisible();
  await expect(page.getByText(diffFixture.newLine).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /^(Save|保存)$/i })).toBeVisible();
  await page.screenshot({ path: path.join(EVIDENCE_DIR, 'edit-tool-link-opened.png'), fullPage: true });
});

test('FileChanges edit row hides status and opens diff context in the text editor', async ({ page }) => {
  /** Business rule: live file-change summaries stay compact and still open git-style diffs. */
  const absolutePath = path.join(SAMPLEAPP_PROJECT_PATH, FILE_CHANGES_TOOL_RELATIVE_PATH);
  const diffFixture = buildLongDiffFixture('fileChangesOpen');
  await writeTextToolCodexFixture({
    sessionId: FILE_CHANGES_TOOL_SESSION_ID,
    relativePath: FILE_CHANGES_TOOL_RELATIVE_PATH,
    toolName: 'FileChanges',
    toolArguments: {
      status: 'Edit file',
      changes: [{
        kind: 'edit',
        path: absolutePath,
        old_string: diffFixture.oldText,
        new_string: diffFixture.newText,
      }],
    },
  });
  const sampleappRoute = `/session/${FILE_CHANGES_TOOL_SESSION_ID}?${new URLSearchParams({ provider: 'codex', projectPath: SAMPLEAPP_PROJECT_PATH })}`;
  await page.goto(sampleappRoute, { waitUntil: 'networkidle' });
  await expandTranscriptDetails(page);

  const fileChangesCard = page.getByTestId('codex-tool-card').filter({ hasText: FILE_CHANGES_TOOL_RELATIVE_PATH });
  await expect(fileChangesCard).toBeVisible();
  await expect(fileChangesCard).not.toContainText('状态:');
  await fileChangesCard.getByRole('button', { name: FILE_CHANGES_TOOL_RELATIVE_PATH }).click();

  await expect(
    page.getByTestId('workspace-dock-layout').getByRole('heading', { name: path.basename(FILE_CHANGES_TOOL_RELATIVE_PATH) }),
  ).toBeVisible();
  await expect(page.getByText('显示更改')).toBeVisible();
  await expect(page.getByTestId('workspace-dock-layout').locator('.cm-editor.cm-merge-b')).toBeVisible();
  await expect(page.getByTestId('workspace-dock-layout').locator('.cm-changedLine').filter({ hasText: diffFixture.newLine }).first()).toBeVisible();
  await expect(page.getByText(diffFixture.oldLine).first()).toBeVisible();
  await expect(page.getByText(diffFixture.newLine).first()).toBeVisible();
  await page.screenshot({ path: path.join(EVIDENCE_DIR, 'file-changes-tool-link-opened.png'), fullPage: true });
});

test('unrelated live follow-up text cannot enter a saved Render snapshot', async ({ page }) => {
  const transcript = await openFixtureManualChat(page);
  const savedText = await transcript.innerText();
  await page.evaluate(() => window.__chatRuntimeEmit?.({
    type: 'codex-response', provider: 'codex', sessionId: 'provider-session-c73', agentporchSessionId: 'c73',
    data: { type: 'item', itemType: 'agent_message', message: { role: 'assistant', content: 'UNRELATED_LIVE_FOLLOWUP' } },
  }));
  await expect(transcript).not.toContainText('UNRELATED_LIVE_FOLLOWUP');
  expect(await transcript.innerText()).toBe(savedText);
  await page.reload({ waitUntil: 'networkidle' });
  await expect(transcript).toContainText('fixture-project manual-only session');
  await expect(transcript).not.toContainText('UNRELATED_LIVE_FOLLOWUP');
});
