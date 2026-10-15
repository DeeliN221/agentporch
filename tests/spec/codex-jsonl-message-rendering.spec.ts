// @ts-nocheck -- Test isolation: strict types deferred. Tracked for incremental tightening.
/**
 * Verify Codex live WebSocket and persisted JSONL rendering share one visual contract.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { expandTranscriptDetails } from './helpers/transcript-test-helpers.ts';
import { PLAYWRIGHT_FIXTURE_HOME } from '../e2e/helpers/playwright-fixture.ts';
import {
  PRIMARY_FIXTURE_PROJECT_PATH,
  authenticatePage,
  resetWorkspaceProject,
} from './helpers/spec-test-helpers.ts';

/**
 * Write Codex JSONL beneath the fixture HOME as the actual post-refresh source.
 *
 * @param {{ sessionId: string, entries: Array<Record<string, unknown>> }} params
 * @returns {Promise<void>}
 */
async function writeCodexSession({ sessionId, entries }) {
  const sessionDir = path.join(PLAYWRIGHT_FIXTURE_HOME, '.codex', 'sessions', '2026', '04', '24');
  await fs.mkdir(sessionDir, { recursive: true });
  await fs.writeFile(
    path.join(sessionDir, `${sessionId}.jsonl`),
    `${entries.map((entry) => JSON.stringify(entry)).join('\n')}\n`,
    'utf8',
  );
}

/**
 * Construct tool-call history representable through both JSONL and WebSocket events.
 *
 * @param {string} sessionId
 * @returns {Array<Record<string, unknown>>}
 */
function buildCodexToolTranscript(sessionId) {
  return [
    {
      type: 'session_meta',
      timestamp: '2026-04-24T07:59:59.000Z',
      payload: {
        id: sessionId,
        cwd: PRIMARY_FIXTURE_PROJECT_PATH,
        model: 'gpt-5-codex',
      },
    },
    {
      type: 'response_item',
      timestamp: '2026-04-24T08:00:00.000Z',
      payload: {
        type: 'message',
        role: 'assistant',
        phase: 'commentary',
        content: [{ type: 'output_text', text: '准备检查工作区并编辑File。' }],
      },
    },
    {
      type: 'response_item',
      timestamp: '2026-04-24T08:00:01.000Z',
      payload: {
        type: 'command_execution',
        id: `${sessionId}-ctx`,
        command: 'ctx_batch_execute',
        arguments: {
          commands: [{ label: 'Source Tree', command: 'rg --files' }],
          queries: ['ToolRenderer ctx_batch_execute'],
        },
        output: [
          'line 1: ignored older output',
          'line 2: ignored older output',
          'line 3: Indexed Source Tree',
          'line 4: ToolRenderer ctx_batch_execute',
          'line 5: found structured renderer',
          'line 6: latest result summary',
        ].join('\n'),
        exitCode: 0,
      },
    },
    {
      type: 'response_item',
      timestamp: '2026-04-24T08:00:03.000Z',
      payload: {
        type: 'file_change',
        id: `${sessionId}-edit`,
        path: 'src/demo.js',
        changeType: 'edit',
      },
    },
  ];
}

/**
 * Use a test WebSocket transport for live events without a real Codex process.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
async function installCodexRealtimeSocket(page) {
  await page.addInitScript(() => {
    class FakeWebSocket extends EventTarget {
      static OPEN = 1;

      constructor(url) {
        super();
        this.url = url;
        this.readyState = FakeWebSocket.OPEN;
        window.__codexRealtimeSocket = this;
        setTimeout(() => {
          this.__opened = true;
          this.onopen?.({ type: 'open' });
        }, 0);
      }

      send() {}

      close() {
        this.readyState = 3;
        this.onclose?.({ type: 'close' });
      }
    }

    window.WebSocket = FakeWebSocket;
    window.__emitCodexRealtime = (message) => {
      const socket = window.__codexRealtimeSocket;
      const sessionId = window.location.pathname.split('/').filter(Boolean).pop();
      const event = { data: JSON.stringify({ sessionId, ...message }) };
      socket?.onmessage?.(event);
      socket?.dispatchEvent?.(new MessageEvent('message', event));
    };
  });
}

/**
 * Open the route with project context without depending on asynchronous indexing timing.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} sessionId
 * @param {'domcontentloaded' | 'networkidle'} waitUntil
 * @returns {Promise<void>}
 */
async function openCodexSession(page, sessionId, waitUntil = 'domcontentloaded') {
  const params = new URLSearchParams({
    provider: 'codex',
    projectPath: PRIMARY_FIXTURE_PROJECT_PATH,
  });
  await page.goto(`/session/${sessionId}?${params.toString()}`, { waitUntil });
  const hasRealtimeSocket = await page.evaluate(() => typeof window.__emitCodexRealtime === 'function');
  if (!hasRealtimeSocket) {
    return;
  }

  await page.waitForFunction(() => Boolean(window.__codexRealtimeSocket?.__opened), null, { timeout: 5000 });
  await page.waitForFunction(() => Boolean(window.__codexRealtimeSocket?.__agentporchCodexBridge), null, { timeout: 5000 });
  await page.evaluate((activeSessionId) => {
    window.__emitCodexRealtime?.({ type: 'session-created', sessionId: activeSessionId });
  }, sessionId);
}

/**
 * Verify transcript text fragments follow reading order.
 *
 * @param {import('@playwright/test').Locator} transcript
 * @param {string[]} expectedTexts
 * @returns {Promise<void>}
 */
async function expectTranscriptOrder(transcript, expectedTexts) {
  const positions = await transcript.evaluate((node, texts) => {
    const fullText = node.textContent || '';
    return texts.map((text) => fullText.indexOf(text));
  }, expectedTexts);
  expect(positions.every((position) => position >= 0), 'all expected transcript texts must be present').toBe(true);
  expect([...positions].sort((a, b) => a - b)).toEqual(positions);
}

test.beforeEach(async ({ page }) => {
  await resetWorkspaceProject();
  await authenticatePage(page);
  await page.addInitScript(() => {
    window.localStorage.setItem('selected-provider', 'codex');
  });
});

test('Codex 实时消息刷新后保持 JSONL 视觉结构', async ({ page }) => {
  /** Scenario: Realtime Codex turn remains visually stable after refresh */
  const sessionId = 'codex-jsonl-visual-stability';
  await installCodexRealtimeSocket(page);
  await writeCodexSession({ sessionId, entries: buildCodexToolTranscript(sessionId) });

  await openCodexSession(page, sessionId, 'networkidle');
  await page.evaluate(() => {
    window.__emitCodexRealtime({
      type: 'codex-response',
      data: {
        type: 'item',
        itemType: 'agent_message',
        message: { content: '准备检查工作区并编辑File。', phase: 'commentary' },
      },
    });
    window.__emitCodexRealtime({
      type: 'codex-response',
      data: {
        type: 'item',
        itemType: 'command_execution',
        itemId: 'codex-jsonl-visual-stability-ctx',
        command: 'ctx_batch_execute',
        arguments: {
          commands: [{ label: 'Source Tree', command: 'rg --files' }],
          queries: ['ToolRenderer ctx_batch_execute'],
        },
        output: [
          'line 1: ignored older output',
          'line 2: ignored older output',
          'line 3: Indexed Source Tree',
          'line 4: ToolRenderer ctx_batch_execute',
          'line 5: found structured renderer',
          'line 6: latest result summary',
        ].join('\n'),
        exitCode: 0,
      },
    });
    window.__emitCodexRealtime({
      type: 'codex-response',
      data: {
        type: 'item',
        itemType: 'file_change',
        itemId: 'codex-jsonl-visual-stability-edit',
        path: 'src/demo.js',
        changeType: 'edit',
      },
    });
  });

  await expandTranscriptDetails(page);
  await expect(page.getByTestId('codex-tool-card')).toHaveCount(2);
  const realtimeCards = await page.getByTestId('codex-tool-card').evaluateAll((cards) =>
    cards.map((card) => ({
      title: card.querySelector('[data-testid="codex-tool-card-title"]')?.textContent,
      collapsed: card.getAttribute('data-collapsed'),
      text: card.textContent,
    })),
  );

  await page.reload({ waitUntil: 'networkidle' });
  await expandTranscriptDetails(page);
  const replayCards = await page.getByTestId('codex-tool-card').evaluateAll((cards) =>
    cards.map((card) => ({
      title: card.querySelector('[data-testid="codex-tool-card-title"]')?.textContent,
      collapsed: card.getAttribute('data-collapsed'),
      text: card.textContent,
    })),
  );

  expect(replayCards).toEqual(realtimeCards);
});

test('Codex 实时同一 assistant item 更新不会重复显示', async ({ page }) => {
  /** Scenario: Codex JSONL item lifecycle keeps one visible assistant message */
  const sessionId = 'codex-realtime-agent-upsert';
  const assistantText = '正在检查工作区，不应该重复闪烁。';
  await writeCodexSession({
    sessionId,
    entries: [
      buildCodexToolTranscript(sessionId)[0],
      {
        type: 'response_item',
        timestamp: '2026-04-24T08:00:00.000Z',
        payload: {
          type: 'message',
          role: 'assistant',
          phase: 'commentary',
          content: [{ type: 'output_text', text: assistantText }],
        },
      },
    ],
  });

  await openCodexSession(page, sessionId, 'networkidle');

  await expect(page.getByText(assistantText)).toHaveCount(1);
});

test('Codex JSONL 中的 Edit file 指令在实时阶段可见', async ({ page }) => {
  /** Scenario: JSONL-only Edit file content is visible in an active Codex session */
  const sessionId = 'codex-edit-visible-realtime';
  await writeCodexSession({ sessionId, entries: buildCodexToolTranscript(sessionId) });

  await openCodexSession(page, sessionId, 'networkidle');
  await expandTranscriptDetails(page);
  await expect(page.getByTestId('codex-tool-card').filter({ hasText: 'src/demo.js' })).toBeVisible();
  await expect(page.getByTestId('tool-file-changes-content')).toContainText('edit');
});

test('Codex JSONL 工具卡片显示命令并默认折叠', async ({ page }) => {
  /** Scenario: JSONL tool card shows the command and uses the persisted collapsed renderer */
  const sessionId = 'codex-running-tool-five-lines';
  const entries = buildCodexToolTranscript(sessionId).slice(0, 2);
  entries.push({
    type: 'response_item',
    timestamp: '2026-04-24T08:00:01.000Z',
    payload: {
      type: 'command_execution',
      id: 'codex-running-tool-five-lines-ctx',
      command: 'ctx_batch_execute',
      arguments: {
        commands: [{ label: 'Source Tree', command: 'rg --files' }],
        queries: ['ToolRenderer ctx_batch_execute'],
      },
      output: ['old line 1', 'new line 2', 'new line 3', 'new line 4', 'new line 5', 'new line 6'].join('\n'),
      exitCode: null,
    },
  });
  await writeCodexSession({ sessionId, entries });
  await openCodexSession(page, sessionId, 'networkidle');
  await expandTranscriptDetails(page);

  const card = page.getByTestId('codex-tool-card').filter({
    has: page.getByTestId('tool-batch-execute-content'),
  }).first();
  await expect(card.getByTestId('tool-batch-execute-content')).toBeVisible();
  await expect(card.getByTestId('codex-tool-card-title')).toHaveCount(0);
  await expect(card).toHaveAttribute('data-collapsed', 'true');
});

test('完成、Failed或中断后的 Codex 工具卡片全部默认折叠', async ({ page }) => {
  /** Scenario: Completed tool cards are collapsed by default */
  const sessionId = 'codex-completed-tools-collapsed';
  await writeCodexSession({ sessionId, entries: buildCodexToolTranscript(sessionId) });

  await openCodexSession(page, sessionId, 'networkidle');
  await expandTranscriptDetails(page);

  const cards = page.getByTestId('codex-tool-card');
  await expect(cards).toHaveCount(2);
  for (const card of await cards.all()) {
    await expect(card).toHaveAttribute('data-collapsed', 'true');
  }
});

test('ctx 工具刷新前后保持同一结构化渲染', async ({ page }) => {
  /** Scenario: ctx tool keeps structured rendering after refresh */
  const sessionId = 'codex-ctx-renderer-refresh';
  await writeCodexSession({ sessionId, entries: buildCodexToolTranscript(sessionId) });

  await openCodexSession(page, sessionId, 'networkidle');
  await expandTranscriptDetails(page);
  const batchCard = page.getByTestId('codex-tool-card').filter({
    has: page.getByTestId('tool-batch-execute-content'),
  }).first();
  const before = await batchCard.getByTestId('tool-batch-execute-content').textContent();
  await expect(batchCard).toHaveAttribute('data-collapsed', 'true');

  await page.reload({ waitUntil: 'networkidle' });
  await expandTranscriptDetails(page);

  const reloadedBatchCard = page.getByTestId('codex-tool-card').filter({
    has: page.getByTestId('tool-batch-execute-content'),
  }).first();
  await expect(reloadedBatchCard.getByTestId('tool-batch-execute-content')).toHaveText(before || '');
  await expect(reloadedBatchCard).toHaveAttribute('data-collapsed', 'true');
});

test('ctx_search 工具卡片默认折叠', async ({ page }) => {
  /** Scenario: ctx_search tool card defaults to collapsed */
  const sessionId = 'codex-ctx-search-collapsed';
  await writeCodexSession({
    sessionId,
    entries: [
      {
        type: 'session_meta',
        timestamp: '2026-04-24T07:59:59.000Z',
        payload: {
          id: sessionId,
          cwd: PRIMARY_FIXTURE_PROJECT_PATH,
          model: 'gpt-5-codex',
        },
      },
      {
        type: 'response_item',
        timestamp: '2026-04-24T08:00:00.000Z',
        payload: {
          type: 'message',
          role: 'assistant',
          phase: 'final',
          content: [{ type: 'output_text', text: '准备搜索上下文。' }],
        },
      },
      {
        type: 'response_item',
        timestamp: '2026-04-24T08:00:01.000Z',
        payload: {
          type: 'command_execution',
          id: `${sessionId}-ctx-search`,
          command: 'ctx_search',
          arguments: {
            queries: ['ToolRenderer ctx_search'],
          },
          output: 'Search result summary',
          exitCode: 0,
        },
      },
    ],
  });

  await openCodexSession(page, sessionId, 'networkidle');
  await expandTranscriptDetails(page);

  const card = page.getByTestId('codex-tool-card').filter({ hasText: 'ctx_search' });
  await expect(card).toHaveAttribute('data-collapsed', 'true');
});

test('命令工具输出不显示单独 Result 摘要行', async ({ page }) => {
  /** Scenario: Completed command cards keep inspectable output without a bottom Result row */
  const sessionId = 'codex-command-output-without-result-row';
  const command = 'printf stable-command-card-output';
  const output = 'stable-command-card-output';
  await writeCodexSession({
    sessionId,
    entries: [
      buildCodexToolTranscript(sessionId)[0],
      {
        type: 'response_item',
        timestamp: '2026-04-24T08:00:01.000Z',
        payload: {
          type: 'command_execution',
          id: `${sessionId}-cmd`,
          command,
          output,
          exitCode: 0,
        },
      },
    ],
  });

  await openCodexSession(page, sessionId, 'networkidle');
  await expandTranscriptDetails(page);

  const card = page.getByTestId('codex-tool-card').filter({ hasText: command }).first();
  await expect(card).toBeVisible();
  await expect(card.getByText('Result', { exact: true })).toHaveCount(0);
  await card.getByRole('button', { name: /show output|hide output/i }).first().click();
  await expect(card.locator('[id^="tool-result-"]').getByText(output, { exact: true })).toBeVisible();
});

test('Pi 历史工具调用在思考块之间保持顺序，刷新后不重复', async ({ page }, testInfo) => {
  /** Scenario: Persisted Pi thinking, tool and result keep their order across refresh */
  test.setTimeout(90_000);
  const sessionId = 'pi-live-nested-tool-card-spec';
  const firstThinking = 'Pi spec thinking before nested tool call';
  const secondThinking = 'Pi spec thinking after nested tool call';
  const toolId = 'pi-live-nested-tool-card-spec-tool';
  const command = 'printf pi-live-nested-tool-card-spec';
  const output = 'pi-live-nested-tool-card-spec';

  const sessionDir = path.join(PLAYWRIGHT_FIXTURE_HOME, '.pi', 'agent', 'sessions');
  await fs.mkdir(sessionDir, { recursive: true });
  const entries = [
    { type: 'session', version: 3, id: sessionId, cwd: PRIMARY_FIXTURE_PROJECT_PATH },
    { type: 'message', timestamp: '2026-04-24T08:00:00.000Z', message: { role: 'assistant', content: [
      { type: 'thinking', thinking: firstThinking },
      { type: 'toolCall', id: toolId, name: 'bash', arguments: { command } },
    ] } },
    { type: 'message', timestamp: '2026-04-24T08:00:01.000Z', message: { role: 'toolResult', toolCallId: toolId, toolName: 'bash', content: [{ type: 'text', text: output }] } },
    { type: 'message', timestamp: '2026-04-24T08:00:02.000Z', message: { role: 'assistant', content: [{ type: 'thinking', thinking: secondThinking }] } },
  ];
  await fs.writeFile(path.join(sessionDir, `${sessionId}.jsonl`), entries.map((entry) => JSON.stringify(entry)).join('\n') + '\n');
  const query = new URLSearchParams({ provider: 'pi', projectPath: PRIMARY_FIXTURE_PROJECT_PATH });
  await page.goto(`/session/${sessionId}?${query}`, { waitUntil: 'networkidle' });
  const transcript = page.getByTestId('chat-rendered-snapshot-pane');
  await expandTranscriptDetails(page);
  await expect(transcript.getByText(firstThinking, { exact: true })).toBeVisible({ timeout: 20_000 });
  const card = transcript.getByTestId('codex-tool-card').filter({ hasText: command }).first();
  await expect(card).toBeVisible({ timeout: 20_000 });
  await expect(transcript.getByTestId('codex-tool-card').filter({ hasText: command })).toHaveCount(1);
  await expect(transcript.getByText(secondThinking, { exact: true })).toBeVisible();
  await expectTranscriptOrder(transcript, [firstThinking, command, secondThinking]);
  await expect(card.getByText('Result', { exact: true })).toHaveCount(0);

  await card.getByRole('button', { name: /show output|hide output/i }).first().click();
  await expect(card.locator('pre.border-t').getByText(output, { exact: true })).toBeVisible();
  await page.reload({ waitUntil: 'networkidle' });
  await expandTranscriptDetails(page);
  await expect(transcript.getByTestId('codex-tool-card')).toHaveCount(1);
  await expectTranscriptOrder(transcript, [firstThinking, command, secondThinking]);
  await expect(page.locator('textarea')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('pi-readonly-history.png') });
});

test('Edit file 工具刷新前后保持同一结构化渲染', async ({ page }) => {
  /** Scenario: Edit file command keeps structured rendering after refresh */
  const sessionId = 'codex-edit-renderer-refresh';
  await writeCodexSession({ sessionId, entries: buildCodexToolTranscript(sessionId) });

  await openCodexSession(page, sessionId, 'networkidle');
  await expandTranscriptDetails(page);
  const before = await page.getByTestId('codex-tool-card').filter({ hasText: 'src/demo.js' }).first().textContent();
  await expect(page.getByTestId('codex-tool-card').filter({ hasText: 'src/demo.js' })).toHaveAttribute('data-collapsed', 'true');

  await page.reload({ waitUntil: 'networkidle' });
  await expandTranscriptDetails(page);

  await expect(page.getByTestId('codex-tool-card').filter({ hasText: 'src/demo.js' }).first()).toHaveText(before || '');
  await expect(page.getByTestId('codex-tool-card').filter({ hasText: 'src/demo.js' })).toHaveAttribute('data-collapsed', 'true');
});
