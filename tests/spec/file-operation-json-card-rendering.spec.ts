// Sources: 2026-06-06-80-修复文件操作JSON渲染为卡片
/**
 * 文件目的：验证 Codex add/edit/write/update 文件操作 JSON 不再直接显示为聊天正文。
 *
 * 业务场景：Codex JSONL 历史 把文件操作包在 agent_message 文本里时，
 * agentporch 必须把它归一成文件操作卡片，避免用户看到 provider 协议 JSON。
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { expandTranscriptDetails } from './helpers/transcript-test-helpers.ts';
import { PLAYWRIGHT_FIXTURE_HOME } from '../e2e/helpers/playwright-fixture.ts';
import {
  PRIMARY_FIXTURE_PROJECT_PATH,
  authenticatePage,
  resetWorkspaceProject,
} from './helpers/spec-test-helpers.ts';

const SESSION_DAY = ['2026', '06', '06'];
const FILE_OPERATIONS = [
  {
    type: 'add',
    path: 'src/proposal80-add.ts',
    content: 'export const proposal80Add = true;',
  },
  {
    type: 'edit',
    path: 'src/proposal80-edit.ts',
    old_string: 'export const proposal80Edit = "before";',
    new_string: 'export const proposal80Edit = "after";',
  },
  {
    type: 'write',
    path: 'docs/proposal80-write.md',
    content: '# proposal 80 write body',
  },
  {
    type: 'update',
    path: 'src/proposal80-update.ts',
    content: 'export const proposal80Update = "next";',
  },
  {
    type: 'update',
    path: path.join(PRIMARY_FIXTURE_PROJECT_PATH, 'src/proposal80-absolute.ts'),
    displayPath: 'src/proposal80-absolute.ts',
    content: 'export const proposal80Absolute = "next";',
  },
];

/**
 * Resolve the real Codex JSONL fixture path used by agentporch session loading.
 */
function codexSessionPath(sessionId: string): string {
  /** docstring：把测试数据放入真实 read model 会扫描的隔离 HOME。 */
  return path.join(PLAYWRIGHT_FIXTURE_HOME, '.codex', 'sessions', ...SESSION_DAY, `${sessionId}.jsonl`);
}

/**
 * Persist one Codex JSONL session with provider-shaped assistant rows.
 */
async function writeCodexSession(sessionId: string, assistantRows: Array<Record<string, unknown>>): Promise<void> {
  /** docstring：通过 JSONL 文件触发真实后端解析，而不是直接塞前端状态。 */
  const sessionPath = codexSessionPath(sessionId);
  await fs.mkdir(path.dirname(sessionPath), { recursive: true });
  const entries = [
    {
      type: 'session_meta',
      timestamp: '2026-06-06T08:00:00.000Z',
      payload: {
        id: sessionId,
        cwd: PRIMARY_FIXTURE_PROJECT_PATH,
        model: 'gpt-5-codex',
      },
    },
    ...assistantRows,
  ];
  await fs.writeFile(sessionPath, `${entries.map((entry) => JSON.stringify(entry)).join('\n')}\n`, 'utf8');
}

/**
 * Convert a provider file operation into the raw JSON string that previously leaked.
 */
function fileOperationJson(operation: Record<string, unknown>): string {
  /** docstring：保留紧凑 JSON，方便断言 raw 字段没有进入 transcript。 */
  return JSON.stringify(operation);
}

/**
 * Build Codex JSONL assistant message rows whose output_text is file-operation JSON.
 */
function buildJsonlFileOperationRows(): Array<Record<string, unknown>> {
  /** docstring：模拟 provider 已把文件操作写入 JSONL message 文本的刷新场景。 */
  return [
    {
      type: 'response_item',
      timestamp: '2026-06-06T08:00:01.000Z',
      payload: {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: '80 提案 Codex 真实正文必须保留。' }],
      },
    },
    ...FILE_OPERATIONS.map((operation, index) => ({
      type: 'response_item',
      timestamp: `2026-06-06T08:00:0${index + 2}.000Z`,
      payload: {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: fileOperationJson(operation) }],
      },
    })),
  ];
}

async function openCodexSession(page: Page, sessionId: string) {
  const query = new URLSearchParams({ provider: 'codex', projectPath: PRIMARY_FIXTURE_PROJECT_PATH });
  await page.goto(`/session/${sessionId}?${query}`, { waitUntil: 'networkidle' });
  await expect(page.getByTestId('chat-rendered-snapshot-pane')).not.toHaveAttribute('data-snapshot-version', '0');
  await expect(page.getByTestId('chat-rendered-snapshot-pane').locator('textarea')).toHaveCount(0);
}

async function assertFileOperationCards(page: Page) {
  await expandTranscriptDetails(page);
  const cards = page.getByTestId('codex-tool-card');
  await expect(cards).toHaveCount(FILE_OPERATIONS.length);
  for (const operation of FILE_OPERATIONS) {
    await expect(cards.filter({ hasText: operation.displayPath || operation.path })).toBeVisible();
    if (operation.displayPath) await expect(cards.filter({ hasText: operation.path })).toHaveCount(0);
  }
  const pane = page.getByTestId('chat-rendered-snapshot-pane');
  await expect(pane).not.toContainText('"type":');
  await expect(pane).not.toContainText('"content":');
  await expect(pane).toContainText('80 提案 Codex 真实正文必须保留。');
}

test.beforeEach(async ({ page }) => {
  await resetWorkspaceProject();
  await authenticatePage(page);
});

test('saved add/edit/write/update JSON renders as file cards', async ({ page }) => {
  const id = 'file-actions-history';
  await writeCodexSession(id, buildJsonlFileOperationRows());
  await openCodexSession(page, id);
  await assertFileOperationCards(page);
});

test('native persisted file_change preserves paths and modification kinds', async ({ page }) => {
  const id = 'native-file-change-history';
  await writeCodexSession(id, [{ type: 'response_item', payload: {
    type: 'file_change', id: 'native-change', path: 'src/native-change.ts', changeType: 'edit',
  }}]);
  await openCodexSession(page, id);
  await expandTranscriptDetails(page);
  const card = page.getByTestId('codex-tool-card');
  await expect(card).toHaveCount(1);
  await expect(card).toContainText('src/native-change.ts');
  await expect(card.getByTestId('tool-file-changes-content')).toContainText('edit');
});

test('business JSON containing a path remains readable text', async ({ page }) => {
  const id = 'business-json-history';
  const text = JSON.stringify({ type: 'report', path: 'roadmap.json', content: 'Business report must remain visible' });
  await writeCodexSession(id, [{ type: 'response_item', payload: {
    type: 'message', role: 'assistant', content: [{ type: 'output_text', text }],
  }}]);
  await openCodexSession(page, id);
  await expect(page.getByTestId('chat-rendered-snapshot-pane')).toContainText('Business report must remain visible');
  await expect(page.getByTestId('codex-tool-card')).toHaveCount(0);
});

test('reasoning summary remains distinct from assistant text sharing an item id', async ({ page }) => {
  const id = 'reasoning-file-history';
  await writeCodexSession(id, [
    { type: 'response_item', payload: { type: 'message', id: 'same-item', role: 'assistant', content: [{ type: 'output_text', text: 'Visible assistant answer' }] } },
    { type: 'response_item', payload: { type: 'reasoning', id: 'same-item', summary: [{ type: 'summary_text', text: 'Visible reasoning summary' }] } },
  ]);
  await openCodexSession(page, id);
  const pane = page.getByTestId('chat-rendered-snapshot-pane');
  await expect(pane).toContainText('Visible assistant answer');
  const toggle = pane.getByTestId('turn-non-body-toggle');
  await expect(toggle).toBeVisible();
  if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
  await expect(pane.getByTestId('turn-thinking-group')).toContainText('Visible reasoning summary');
});

test('file cards survive repeated history reloads without duplicates', async ({ page }, testInfo) => {
  const id = 'file-actions-reload';
  await writeCodexSession(id, buildJsonlFileOperationRows());
  await openCodexSession(page, id);
  await assertFileOperationCards(page);
  for (let i = 0; i < 2; i++) {
    await page.reload({ waitUntil: 'networkidle' });
    await assertFileOperationCards(page);
  }
  await page.screenshot({ path: testInfo.outputPath('file-operation-history.png'), fullPage: true });
});
