// @ts-nocheck -- Browser fixtures use injected runtime globals.
/** Verify saved Codex follow-up ordering across partial read models, explicit reloads, fetch failure, and recovery. */
import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

import {
  authenticatePage,
  openFixtureProject,
  PRIMARY_FIXTURE_PROJECT_PATH,
} from '../spec/helpers/spec-test-helpers.ts';

const SESSION_ID = 'proposal-68-codex-followup-refresh-order';
const EVIDENCE_DIR = path.resolve(process.cwd(), 'test-results/codex-session-68-followup-refresh-order');
const TURN_1_USER = 'proposal 68 第一轮已持久化需求';
const TURN_1_ASSISTANT = 'proposal 68 第一轮 Codex 已落盘回复';
const TURN_2_USER = 'proposal 68 第二轮追加请求';
const TURN_2_LIVE = 'proposal 68 第二轮 Codex 回复内容';
const TURN_2_PERSISTED = TURN_2_LIVE;
const TURN_3_USER = 'proposal 68 第三轮追加请求';
const TURN_3_LIVE = 'proposal 68 第三轮 Codex live 回复内容';
const TURN_3_PERSISTED = 'proposal 68 第三轮 Codex 最终落盘回复';

test('Codex saved follow-ups retain order across partial history, fetch failure, and recovery', async ({ page }) => {
  test.setTimeout(90_000);
  const readModel = { stage: 'turn1-only', failNext: false };
  const messageResponses = [];
  const errors = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await installCodexSocketHarness(page);
  await installMessagesMock(page, readModel, messageResponses);
  await openFixtureProject(page);
  await openCodexSessionRoute(page);
  const transcript = page.getByTestId('chat-scroll-container').last();
  await expectTranscriptOrder(transcript, [TURN_1_USER, TURN_1_ASSISTANT]);
  await expect(page.locator('textarea.chat-input-placeholder')).toHaveCount(0);
  await emitLiveAssistant(page, TURN_2_LIVE, 'obsolete-live-second-turn');
  await expectTranscriptOrder(transcript, [TURN_1_USER, TURN_1_ASSISTANT]);
  for (const stage of ['turn2-caught-up', 'all-caught-up']) {
    readModel.stage = stage;
    await page.reload({ waitUntil: 'networkidle' });
    const expected = [TURN_1_USER, TURN_1_ASSISTANT, TURN_2_USER, TURN_2_PERSISTED,
      ...(stage === 'all-caught-up' ? [TURN_3_USER, TURN_3_PERSISTED] : [])];
    await expectTranscriptOrder(transcript, expected);
    for (const text of expected) await expect(transcript.getByText(text, { exact: true })).toHaveCount(1);
  }
  readModel.failNext = true;
  await page.reload({ waitUntil: 'networkidle' });
  await expect.poll(() => messageResponses.some(response => response.status === 503)).toBe(true);
  await expect.poll(() => errors.some(text => text.includes('Error loading session messages'))).toBe(true);
  await page.reload({ waitUntil: 'networkidle' });
  await expectTranscriptOrder(transcript, [TURN_1_USER, TURN_1_ASSISTANT, TURN_2_USER, TURN_2_PERSISTED, TURN_3_USER, TURN_3_PERSISTED]);
  for (const text of [TURN_2_USER, TURN_2_PERSISTED, TURN_3_USER, TURN_3_PERSISTED]) {
    await expect(transcript.getByText(text, { exact: true })).toHaveCount(1);
  }
  await writeEvidence(page, messageResponses);
});

async function installCodexSocketHarness(page) {
  /**
   * Replace the app WebSocket with a deterministic harness that captures real
   * composer sends and lets the test emit provider events into the app handler.
   */
  await page.addInitScript(() => {
    const sentKey = '__proposal68CodexSent';

    function readSent() {
      try {
        return JSON.parse(window.localStorage.getItem(sentKey) || '[]');
      } catch {
        return [];
      }
    }

    function dispatch(socket, payload) {
      const event = new MessageEvent('message', { data: JSON.stringify(payload) });
      socket?.onmessage?.(event);
      socket?.dispatchEvent?.(event);
    }

    class FakeWebSocket extends EventTarget {
      constructor() {
        super();
        window.__proposal68Socket = this;
        setTimeout(() => {
          this.readyState = WebSocket.OPEN;
          this.onopen?.();
          this.dispatchEvent(new Event('open'));
        }, 0);
      }

      send(payload) {
        const message = JSON.parse(payload);
        const sent = readSent();
        sent.push(message);
        window.localStorage.setItem(sentKey, JSON.stringify(sent));

        if (message.type === 'codex-command') {
          setTimeout(() => {
            dispatch(this, {
              type: 'message-accepted',
              provider: 'codex',
              sessionId: message.sessionId || message.agentporchSessionId || 'proposal-68',
              agentporchSessionId: message.agentporchSessionId || null,
              clientRequestId: message.clientRequestId,
            });
          }, 0);
        }
      }

      close() {
        this.readyState = WebSocket.CLOSED;
        this.onclose?.();
        this.dispatchEvent(new Event('close'));
      }
    }

    FakeWebSocket.CONNECTING = 0;
    FakeWebSocket.OPEN = 1;
    FakeWebSocket.CLOSING = 2;
    FakeWebSocket.CLOSED = 3;
    window.WebSocket = FakeWebSocket;
    window.__proposal68Emit = (payload) => dispatch(window.__proposal68Socket, payload);
    window.__proposal68SentMessages = () => readSent();
    window.localStorage.setItem('selected-provider', 'codex');
  });
}

async function installMessagesMock(page, readModel, messageResponses) {
  /**
   * Serve progressively caught-up Codex read models and one explicit failure
   * so reload behavior is tested without calling a real Codex process.
   */
  const handleMessagesRoute = async (route) => {
    if (readModel.failNext) {
      readModel.failNext = false;
      messageResponses.push({ stage: readModel.stage, status: 503, total: 0 });
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'proposal 68 forced read-model lag failure' }),
      });
      return;
    }

    const messages = buildPersistedMessages(readModel.stage);
    messageResponses.push({ stage: readModel.stage, status: 200, total: messages.length });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        messages,
        total: messages.length,
        hasMore: false,
        source: `proposal-68-${readModel.stage}`,
      }),
    });
  };

  await page.route(`**/api/codex/sessions/${SESSION_ID}/messages**`, handleMessagesRoute);
  await page.route(`**/api/projects/**/sessions/${SESSION_ID}/messages**`, handleMessagesRoute);
}

async function openCodexSessionRoute(page) {
  /**
   * Open the restored Codex manual-session route with the fixture project path.
   */
  const query = new URLSearchParams({
    provider: 'codex',
    projectPath: PRIMARY_FIXTURE_PROJECT_PATH,
    sessionSummary: 'proposal 68 Codex follow-up ordering',
  });
  await page.goto(`/session/${SESSION_ID}?${query.toString()}`, { waitUntil: 'networkidle' });
}

async function submitPrompt(page, text) {
  /**
   * Submit through the real composer so optimistic user state is created by app code.
   */
  const input = page.locator('textarea').first();
  await expect(input).toBeEnabled({ timeout: 20_000 });
  await input.fill(text);
  await input.press('Control+Enter');
  await expect.poll(() => capturedCodexCommands(page).then((messages) => (
    messages.filter((message) => message.command === text).length
  ))).toBe(1);
}

async function emitLiveAssistant(page, text, itemId) {
  /**
   * Push one native Codex live assistant item into the active chat socket.
   */
  await page.evaluate(({ content, id, sessionId }) => {
    window.__proposal68Emit?.({
      type: 'codex-response',
      provider: 'codex',
      sessionId,
      data: {
        type: 'item',
        itemType: 'agent_message',
        itemId: id,
        message: { role: 'assistant', content },
      },
    });
  }, { content: text, id: itemId, sessionId: SESSION_ID });
}

async function emitProjectsUpdated(page) {
  /**
   * Trigger the same read-model reload path used by provider filesystem updates.
   */
  await page.evaluate(({ sessionId, projectPath }) => {
    window.__proposal68Emit?.({
      type: 'projects_updated',
      provider: 'codex',
      watchProvider: 'codex',
      sessionId,
      projectPath,
    });
  }, { sessionId: SESSION_ID, projectPath: PRIMARY_FIXTURE_PROJECT_PATH });
  await page.waitForTimeout(250);
}

async function emitCodexComplete(page) {
  /**
   * Trigger the complete-state reload that must switch from live rows to JSONL.
   */
  await page.evaluate((sessionId) => {
    window.__proposal68Emit?.({
      type: 'codex-complete',
      provider: 'codex',
      sessionId,
      actualSessionId: sessionId,
      exitCode: 0,
    });
  }, SESSION_ID);
  await page.waitForTimeout(700);
}

async function waitForSubmitCooldown(page) {
  /**
   * Wait for the app's duplicate-submit guard before sending the next follow-up.
   */
  await page.waitForTimeout(1600);
}

async function capturedCodexCommands(page) {
  /**
   * Return outbound Codex command frames captured by the fake socket.
   */
  return page.evaluate(() => window.__proposal68SentMessages?.().filter((message) => message.type === 'codex-command') || []);
}

async function expectTranscriptOrder(transcript, expectedTexts) {
  /**
   * Assert the user-visible DOM text order rather than component existence.
   */
  await expect.poll(async () => transcript.evaluate((node, texts) => {
    const fullText = node.textContent || '';
    const positions = texts.map((text) => fullText.indexOf(text));
    return {
      positions,
      allPresent: positions.every((position) => position >= 0),
      inOrder: positions.every((position, index) => index === 0 || position >= positions[index - 1]),
    };
  }, expectedTexts)).toMatchObject({ allPresent: true, inOrder: true });
}

async function expectPageTextOrder(page, expectedTexts) {
  /**
   * Assert text order after a browser refresh, where the transcript container is
   * remounted and a pre-refresh locator can become stale.
   */
  await expect.poll(async () => page.evaluate((texts) => {
    const fullText = document.body.textContent || '';
    const positions = texts.map((text) => fullText.indexOf(text));
    return {
      positions,
      allPresent: positions.every((position) => position >= 0),
      inOrder: positions.every((position, index) => index === 0 || position >= positions[index - 1]),
      bodyText: fullText.replace(/\s+/g, ' ').trim().slice(0, 1000),
    };
  }, expectedTexts), { timeout: 20_000 }).toMatchObject({ allPresent: true, inOrder: true });
}

function buildPersistedMessages(stage) {
  /**
   * Build raw session messages in the same shape consumed by convertSessionMessages.
   */
  const messages = [
    userRecord('proposal-68-user-1', TURN_1_USER, '2026-06-03T10:00:00.000Z'),
    assistantRecord('proposal-68-assistant-1', TURN_1_ASSISTANT, '2026-06-03T10:00:05.000Z'),
  ];
  if (stage === 'turn2-caught-up' || stage === 'all-caught-up') {
    messages.push(
      userRecord('proposal-68-user-2', TURN_2_USER, '2026-06-03T10:01:00.000Z'),
      assistantRecord('proposal-68-assistant-2', TURN_2_PERSISTED, '2026-06-03T10:01:30.000Z'),
    );
  }
  if (stage === 'all-caught-up') {
    messages.push(
      userRecord('proposal-68-user-3', TURN_3_USER, '2026-06-03T10:02:00.000Z'),
      assistantRecord('proposal-68-assistant-3', TURN_3_PERSISTED, '2026-06-03T10:02:30.000Z'),
    );
  }
  return messages;
}

function userRecord(messageKey, content, timestamp) {
  /**
   * Create one persisted Codex user row.
   */
  return {
    type: 'message',
    provider: 'codex',
    messageKey,
    timestamp,
    message: { role: 'user', content },
  };
}

function assistantRecord(messageKey, content, timestamp) {
  /**
   * Create one persisted Codex assistant row.
   */
  return {
    type: 'message',
    provider: 'codex',
    messageKey,
    timestamp,
    message: { role: 'assistant', content },
  };
}

async function writeEvidence(page, messageResponses) {
  /**
   * Persist QA artifacts for final browser state, read-model traffic, and screenshot.
   */
  await fs.mkdir(EVIDENCE_DIR, { recursive: true });
  await page.screenshot({
    path: path.join(EVIDENCE_DIR, 'final-refresh.png'),
    fullPage: true,
  });
  const state = await page.evaluate(() => ({
    bodyText: document.body.textContent || '',
    sentMessages: window.__proposal68SentMessages?.() || [],
  }));
  await fs.writeFile(
    path.join(EVIDENCE_DIR, 'state-snapshot.json'),
    JSON.stringify(state, null, 2),
    'utf8',
  );
  await fs.writeFile(
    path.join(EVIDENCE_DIR, 'read-model-network.json'),
    JSON.stringify(messageResponses, null, 2),
    'utf8',
  );
}
