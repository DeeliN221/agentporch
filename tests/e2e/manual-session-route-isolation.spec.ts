// @ts-nocheck -- Test isolation: strict types deferred. Tracked for incremental tightening.
/**
 * PURPOSE: Verify manually created route sessions do not inherit the previous
 * chat transcript or dispatch user input to the previous session.
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  openFixtureManualSessionFromOverview,
  openFixtureProject,
  PRIMARY_FIXTURE_PROJECT_PATH,
} from '../spec/helpers/spec-test-helpers.ts';
import {
  PLAYWRIGHT_FIXTURE_HOME,
} from './helpers/playwright-fixture.ts';
import {
  readProjectLocalConfig,
} from '../../backend/project-config-store.ts';
import {
  getNextManualRouteIndex,
} from '../../backend/domains/projects/project-config-read-model.ts';

const shellMessagesByPage = new WeakMap();

/**
 * Install a transparent WebSocket send spy while preserving real network sends.
 */
async function installWebSocketSendCapture(page) {
  await page.addInitScript(() => {
    const OriginalWebSocket = window.WebSocket;
    window.__manualRouteWsMessages = [];

    function PatchedWebSocket(...args) {
      const socket = new OriginalWebSocket(...args);
      const originalSend = socket.send.bind(socket);
      socket.send = function patchedSend(data) {
        try {
          window.__manualRouteWsMessages.push(JSON.parse(data));
        } catch {
          window.__manualRouteWsMessages.push(data);
        }
        return originalSend(data);
      };
      return socket;
    }

    PatchedWebSocket.prototype = OriginalWebSocket.prototype;
    for (const key of ['OPEN', 'CONNECTING', 'CLOSING', 'CLOSED']) {
      PatchedWebSocket[key] = OriginalWebSocket[key];
    }
    window.WebSocket = PatchedWebSocket;
  });
}

/**
 * Read captured outbound browser WebSocket messages.
 */
async function readCapturedMessages(page) {
  return [...(shellMessagesByPage.get(page) || []), ...await page.evaluate(() => window.__manualRouteWsMessages || [])];
}

/**
 * Write an unrelated Codex history whose id collides with the next cN draft.
 */
async function writeUnrelatedCodexHistory(sessionId, content) {
  const sessionDir = path.join(PLAYWRIGHT_FIXTURE_HOME, '.codex', 'sessions', '2026', '04', '20');
  await fs.mkdir(sessionDir, { recursive: true });
  await fs.writeFile(
    path.join(sessionDir, `${sessionId}.jsonl`),
    [
      JSON.stringify({
        type: 'session_meta',
        timestamp: '2026-04-20T10:00:00.000Z',
        payload: {
          id: sessionId,
          cwd: path.join(PLAYWRIGHT_FIXTURE_HOME, 'workspace', 'unrelated-codex-project'),
          model: 'gpt-5-codex',
        },
      }),
      JSON.stringify({
        type: 'event_msg',
        timestamp: '2026-04-20T10:00:01.000Z',
        payload: {
          type: 'user_message',
          message: 'unrelated cN collision user message',
        },
      }),
      JSON.stringify({
        type: 'response_item',
        timestamp: '2026-04-20T10:00:02.000Z',
        payload: {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: content }],
        },
      }),
    ].join('\n') + '\n',
    'utf8',
  );
}

/**
 * Read the next user-visible cN route id from the same config the app uses.
 */
async function readNextManualRouteSessionId() {
  const config = await readProjectLocalConfig(PRIMARY_FIXTURE_PROJECT_PATH);
  return `c${getNextManualRouteIndex(config)}`;
}

test.beforeEach(async ({ page }) => {
  await installWebSocketSendCapture(page);
  await page.route('**/api/diagnostics/runtime-dependencies', async (route) => {
    const response = await route.fetch();
    const payload = await response.json();
    payload.capabilities = { ...payload.capabilities, manualSessions: ['codex', 'pi'] };
    await route.fulfill({ response, json: payload });
  });
  // Transport isolation: real PTY delivery is covered by terminal-new-session.
  shellMessagesByPage.set(page, []);
  await page.routeWebSocket('**/shell**', (socket) => {
    socket.onMessage((raw) => {
      const message = JSON.parse(String(raw));
      shellMessagesByPage.get(page).push(message);
      if (message.type === 'init') socket.send(JSON.stringify({ type: 'output', data: 'Fixture terminal ready\r\n' }));
    });
  });
  await page.addInitScript(() => {
    window.prompt = (_message, defaultValue = '') => String(defaultValue || '');
  });
});

async function assertFreshTerminalInput(page, provider, routeSessionId) {
  await expect(page.getByTestId('tab-shell')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => (await readCapturedMessages(page)).find((message) => message?.type === 'init')).toMatchObject({
    provider, routeSessionId, providerSessionId: null, hasSession: false,
  });
  const messageText = `${provider} route isolation input`;
  await page.locator('.xterm-helper-textarea').focus();
  await page.keyboard.type(messageText);
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await readCapturedMessages(page))
    .filter((message) => message?.type === 'input').map((message) => message.data).join('')).toContain(messageText);
  const messages = await readCapturedMessages(page);
  expect(messages.some((message) => /^(codex|pi)-command$/.test(message?.type || ''))).toBe(false);
  expect(messages.filter((message) => message?.type === 'init').every((message) => message.routeSessionId === routeSessionId)).toBe(true);
}

test('manual new session clears previous transcript and sends terminal input to the new route', async ({ page }) => {
  await openFixtureProject(page);
  await openFixtureManualSessionFromOverview(page);
  const previousRouteSessionId = new URL(page.url()).pathname.split('/').at(-1);
  await expect(page.getByTestId('chat-rendered-snapshot-pane')).toContainText('fixture-project manual-only session');
  await page.getByRole('button', { name: /^fixture-project\b/i }).first().click();
  await page.getByTestId('project-new-session-button').click();
  await page.getByTestId('project-new-session-provider-pi').click();
  await expect(page).toHaveURL(/\/c\d+\?tab=shell&provider=pi$/);
  const routeSessionId = new URL(page.url()).pathname.split('/').at(-1);
  expect(routeSessionId).not.toBe(previousRouteSessionId);
  await expect(page.getByTestId('chat-rendered-snapshot-pane')).toHaveCount(0);
  await assertFreshTerminalInput(page, 'pi', routeSessionId);
});

test('Codex draft route collisions never resume or render another project history', async ({ page }) => {
  await openFixtureProject(page);
  const routeSessionId = await readNextManualRouteSessionId();
  const collisionText = `unrelated codex ${routeSessionId} history`;
  await writeUnrelatedCodexHistory(routeSessionId, collisionText);
  await page.getByTestId('project-new-session-button').click();
  await page.getByTestId('project-new-session-provider-codex').click();
  await expect(page).toHaveURL(new RegExp(`/${routeSessionId}\\?tab=shell$`));
  await assertFreshTerminalInput(page, 'codex', routeSessionId);
  const url = new URL(page.url());
  url.search = '?tab=chat';
  shellMessagesByPage.set(page, []);
  await page.goto(url.toString(), { waitUntil: 'networkidle' });
  await expect(page.getByTestId('chat-rendered-snapshot-pane')).toBeVisible();
  await expect(page.getByTestId('chat-rendered-snapshot-pane')).not.toContainText(collisionText);
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.getByTestId('chat-rendered-snapshot-pane')).not.toContainText(collisionText);
  expect((await readCapturedMessages(page)).filter((message) => message?.type === 'init')).toEqual([]);
});
