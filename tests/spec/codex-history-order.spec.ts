// @ts-nocheck -- Browser acceptance test uses fixture-only globals and DOM probes.
/**
 * Verify raw-line cursor pagination never moves user bubbles to the transcript end.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { expandTranscriptDetails } from './helpers/transcript-test-helpers.ts';
import {
  ensurePlaywrightFixture,
  PLAYWRIGHT_FIXTURE_HOME,
} from '../e2e/helpers/playwright-fixture.ts';
import {
  PRIMARY_FIXTURE_PROJECT_PATH,
  authenticatePage,
} from './helpers/spec-test-helpers.ts';

const EVIDENCE_DIR = path.resolve(process.cwd(), 'test-results/proposal-87-codex-history-order');
const TRACE_DIR = path.join(EVIDENCE_DIR, 'playwright-output');
const CONSOLE_NETWORK_PATH = path.join(EVIDENCE_DIR, 'console-network.json');
const SERVER_LOG_PATH = path.join(EVIDENCE_DIR, 'server.log');
const SESSION_DAY = ['2026', '06', '07'];

test.describe.configure({ mode: 'serial' });
test.use({ trace: 'off' });

/**
 * Resolve the JSONL path used by the real Codex session reader.
 */
function codexSessionPath(sessionId: string): string {
  /**
   * Write only to the isolated Playwright HOME, preserving real developer history.
   */
  return path.join(PLAYWRIGHT_FIXTURE_HOME, '.codex', 'sessions', ...SESSION_DAY, `${sessionId}.jsonl`);
}

/**
 * Build Codex session metadata tied to the fixture project.
 */
function sessionMeta(sessionId: string): Record<string, unknown> {
  /**
   * cwd associates the Codex session with the fixture project.
   */
  return {
    type: 'session_meta',
    timestamp: '2026-06-07T04:00:00.000Z',
    payload: {
      id: sessionId,
      cwd: PRIMARY_FIXTURE_PROJECT_PATH,
      model: 'gpt-5-codex',
    },
  };
}

/**
 * Build a duplicated Codex user echo row.
 */
function userResponse(timestamp: string, text: string): Record<string, unknown> {
  /**
   * Concurrent response_item user echoes and event_msg rows reproduce the ordering regression.
   */
  return {
    type: 'response_item',
    timestamp,
    payload: {
      type: 'message',
      role: 'user',
      content: [{ type: 'input_text', text }],
    },
  };
}

/**
 * Build the visible user message event.
 */
function userEvent(timestamp: string, text: string): Record<string, unknown> {
  /**
   * event_msg/user_message is a common user-bubble source in Codex history.
   */
  return {
    type: 'event_msg',
    timestamp,
    payload: { type: 'user_message', message: text },
  };
}

/**
 * Build a visible assistant message.
 */
function assistantMessage(timestamp: string, text: string): Record<string, unknown> {
  /**
   * Assistant prose verifies each user bubble remains before its turn's response.
   */
  return {
    type: 'response_item',
    timestamp,
    payload: {
      type: 'message',
      role: 'assistant',
      phase: 'commentary',
      content: [{ type: 'output_text', text }],
    },
  };
}

/**
 * Build a function-call row so raw lines and UI messages are not one-to-one.
 */
function toolCall(timestamp: string, index: number): Record<string, unknown> {
  /**
   * Tool calls amplify the mismatch between message counts and raw-line offsets.
   */
  return {
    type: 'response_item',
    timestamp,
    payload: {
      type: 'function_call',
      name: 'exec_command',
      call_id: `proposal-87-call-${index}`,
      arguments: JSON.stringify({ cmd: `printf proposal-87-${index}` }),
    },
  };
}

/**
 * Build a function result row.
 */
function toolResult(timestamp: string, index: number): Record<string, unknown> {
  /**
   * Tool results pair with calls to verify assistant/tool context order within a turn.
   */
  return {
    type: 'response_item',
    timestamp,
    payload: {
      type: 'function_call_output',
      call_id: `proposal-87-call-${index}`,
      output: `proposal-87-${index}`,
    },
  };
}

/**
 * Write a long Codex rollout fixture that requires top pagination.
 */
async function writeLongCodexHistory(sessionId: string): Promise<void> {
  /**
   * The real backend parses pagination, role filtering, and duplicate echoes from JSONL.
   */
  const lines: Array<Record<string, unknown>> = [
    sessionMeta(sessionId),
    {
      type: 'response_item',
      timestamp: '2026-06-07T04:00:00.001Z',
      payload: {
        type: 'message',
        role: 'developer',
        content: [{ type: 'input_text', text: 'proposal 87 developer 内部指令不得显示' }],
      },
    },
  ];

  for (let turn = 1; turn <= 8; turn += 1) {
    const minute = String(turn).padStart(2, '0');
    const userText = `proposal 87 第${turn}轮用户需求`;
    lines.push(
      userResponse(`2026-06-07T04:${minute}:00.000Z`, userText),
      userEvent(`2026-06-07T04:${minute}:00.001Z`, userText),
      assistantMessage(`2026-06-07T04:${minute}:10.000Z`, `proposal 87 第${turn}轮开始处理`),
    );

    for (let index = 0; index < 16; index += 1) {
      const toolIndex = turn * 100 + index;
      lines.push(
        toolCall(`2026-06-07T04:${minute}:20.000Z`, toolIndex),
        toolResult(`2026-06-07T04:${minute}:21.000Z`, toolIndex),
      );
    }

    lines.push(assistantMessage(`2026-06-07T04:${minute}:50.000Z`, `proposal 87 第${turn}轮最终回复`));
  }

  const sessionPath = codexSessionPath(sessionId);
  await fs.mkdir(path.dirname(sessionPath), { recursive: true });
  await fs.writeFile(sessionPath, `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`, 'utf8');
}

/**
 * Open the fixture Codex session through its provider history route.
 */
async function openCodexHistory(page, sessionId: string): Promise<void> {
  /**
   * The browser uses the actual history-session route rather than reading raw JSONL.
   */
  const query = new URLSearchParams({ provider: 'codex', projectPath: PRIMARY_FIXTURE_PROJECT_PATH });
  await page.goto(`/session/${sessionId}?${query}`, { waitUntil: 'networkidle' });
  await expect(page.locator('[data-testid="chat-scroll-container"]')).toBeVisible();
}

/**
 * Read visible chat rows in DOM order.
 */
async function readTranscriptRows(page): Promise<Array<Record<string, string>>> {
  /**
   * Acceptance follows visible chat-row order.
   */
  return page.locator('.chat-message').evaluateAll((rows) =>
    rows.map((row) => ({
      key: row.getAttribute('data-message-key') || '',
      type: Array.from(row.classList).find((className) => ['user', 'assistant', 'thinking'].includes(className)) || '',
      text: (row.textContent || '').replace(/\s+/g, ' ').trim(),
    })).filter((row) => row.text),
  );
}

/**
 * Persist screenshot and transcript state evidence.
 */
async function saveEvidence(page, name: string): Promise<void> {
  /**
   * Screenshots support review; JSON records DOM order and messageKey values.
   */
  await fs.mkdir(EVIDENCE_DIR, { recursive: true });
  await page.screenshot({ path: path.join(EVIDENCE_DIR, `${name}.png`), fullPage: true });
  const rows = await readTranscriptRows(page);
  const transcriptPath = path.join(EVIDENCE_DIR, 'transcript-state.json');
  let previousState = {};
  try {
    previousState = JSON.parse(await fs.readFile(transcriptPath, 'utf8'));
  } catch {
    previousState = {};
  }
  await fs.writeFile(
    transcriptPath,
    `${JSON.stringify({ ...previousState, [name]: rows }, null, 2)}\n`,
    'utf8',
  );
}

/**
 * Create browser/runtime evidence collectors required by the sealed acceptance contract.
 */
async function startRuntimeEvidence(page, context) {
  /**
   * Evidence includes browser errors, failed requests, and backend pagination contracts.
   */
  const events: Array<Record<string, unknown>> = [];
  const serverRows: Array<Record<string, unknown>> = [];

  await fs.rm(EVIDENCE_DIR, { recursive: true, force: true });
  await fs.mkdir(TRACE_DIR, { recursive: true });
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });

  page.on('console', (message) => {
    events.push({
      kind: 'console',
      type: message.type(),
      text: message.text(),
      location: message.location(),
    });
  });

  page.on('pageerror', (error) => {
    events.push({
      kind: 'pageerror',
      message: error.message,
      stack: error.stack || null,
    });
  });

  page.on('requestfailed', (request) => {
    const failure = request.failure()?.errorText || null;
    const isBrowserAbort = failure === 'net::ERR_ABORTED';
    events.push({
      kind: 'requestfailed',
      method: request.method(),
      url: request.url(),
      failure,
      ignored: isBrowserAbort,
      explanation: isBrowserAbort
        ? 'Browser cancelled an in-flight request during navigation or route refresh; not a server/API failure.'
        : null,
    });
  });

  page.on('response', async (response) => {
    const url = response.url();
    const isMessagesResponse = /\/api\/(?:projects\/[^/]+\/sessions|codex\/sessions)\/[^/]+\/messages/.test(url);
    if (!isMessagesResponse) {
      return;
    }

    const request = response.request();
    const parsedUrl = new URL(url);
    let body: Record<string, unknown> = {};
    try {
      body = await response.json();
    } catch {
      body = {};
    }
    serverRows.push({
      provider: parsedUrl.searchParams.get('provider') || 'unknown',
      sessionId: decodeURIComponent(parsedUrl.pathname.split('/').at(-2) || ''),
      offset: parsedUrl.searchParams.get('offset'),
      afterLine: parsedUrl.searchParams.get('afterLine'),
      nextRawLineOffset: body.nextRawLineOffset ?? null,
      returnedMessages: Array.isArray(body.messages) ? body.messages.length : 0,
      total: body.total ?? null,
      status: response.status(),
      method: request.method(),
    });
  });

  return {
    async flush() {
      /**
       * Persist the required trace, console/network output, and server log at test end.
       */
      await fs.mkdir(TRACE_DIR, { recursive: true });
      await context.tracing.stop({ path: path.join(TRACE_DIR, 'trace.zip') }).catch(() => undefined);
      await fs.writeFile(CONSOLE_NETWORK_PATH, `${JSON.stringify(events, null, 2)}\n`, 'utf8');
      await fs.writeFile(
        SERVER_LOG_PATH,
        `${serverRows.map((row) => JSON.stringify(row)).join('\n')}\n`,
        'utf8',
      );
    },
  };
}

/**
 * Assert that transcript rows contain each expected text in order.
 */
function expectTextsInOrder(rows: Array<Record<string, string>>, texts: string[]): void {
  /**
   * Check business-text ordering independently of avatars, timestamps, and local styling.
   */
  let start = 0;
  for (const text of texts) {
    const index = rows.findIndex((row, rowIndex) => rowIndex >= start && row.text.includes(text));
    expect(index, `missing ordered text: ${text}`).toBeGreaterThanOrEqual(0);
    start = index + 1;
  }
}

test.beforeEach(async ({ page }) => {
  /**
   * Rebuild isolated fixtures before each test while keeping authentication available.
   */
  ensurePlaywrightFixture({ preserveAuthDatabase: true });
  await authenticatePage(page);
});

test('Codex 完整历史在打开、滚动和刷新后保持轮次顺序', async ({ page, context, request }) => {
  /**
   * Scenario: Open the latest window, scroll into earlier history, and then load all;
   * none of these steps may gather user bubbles at the transcript end.
   */
  test.setTimeout(90_000);
  const sessionId = 'proposal-87-codex-history-order';
  const evidence = await startRuntimeEvidence(page, context);

  try {
    await writeLongCodexHistory(sessionId);
    await openCodexHistory(page, sessionId);
    await expandTranscriptDetails(page);

    await expect(page.locator('[data-testid="chat-scroll-container"]')).toContainText('proposal 87 第8轮最终回复');
    await saveEvidence(page, 'history-open');

    await page.locator('[data-testid="chat-scroll-container"]').evaluate((container) => {
      container.scrollTop = 0;
      container.dispatchEvent(new Event('scroll', { bubbles: true }));
    });
    await expect(page.locator('[data-testid="chat-scroll-container"]')).toContainText('proposal 87 第3轮最终回复');
    await saveEvidence(page, 'load-earlier');

    // Reopen the snapshot, then scroll back through history without the retired Load all control.
    await page.reload({ waitUntil: 'networkidle' });
    await expandTranscriptDetails(page);
    await page.locator('[data-testid="chat-scroll-container"]').evaluate((container) => {
      container.scrollTop = 0;
      container.dispatchEvent(new Event('scroll', { bubbles: true }));
    });
    await expect(page.locator('[data-testid="chat-scroll-container"]')).toContainText('proposal 87 第1轮用户需求');
    await expandTranscriptDetails(page);
    await saveEvidence(page, 'load-all');

    const topRows = await readTranscriptRows(page);
    expect(topRows.some((row) => row.text.includes('developer 内部指令'))).toBe(false);
    expectTextsInOrder(topRows, [
      'proposal 87 第1轮用户需求',
      'proposal 87 第1轮开始处理',
      'proposal 87 第1轮最终回复',
      'proposal 87 第2轮用户需求',
      'proposal 87 第2轮开始处理',
      'proposal 87 第2轮最终回复',
    ]);

    await page.locator('[data-testid="chat-scroll-container"]').evaluate((container) => {
      container.scrollTop = container.scrollHeight;
      container.dispatchEvent(new Event('scroll', { bubbles: true }));
    });
    await expect(page.locator('[data-testid="chat-scroll-container"]')).toContainText('proposal 87 第8轮最终回复');
    const bottomRows = await readTranscriptRows(page);
    expectTextsInOrder(bottomRows, [
      'proposal 87 第8轮用户需求',
      'proposal 87 第8轮最终回复',
    ]);
    expect(bottomRows.filter((row) => row.text.includes('proposal 87 第8轮用户需求'))).toHaveLength(1);
  } finally {
    await evidence.flush();
  }
});
