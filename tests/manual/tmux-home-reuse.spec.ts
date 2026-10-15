/**
 * 文件目的：从真实主页卡片进入已有 Codex 终端，证明没有增加窗口或重启进程。
 * 前提：隔离实例已通过界面创建独立验收项目和真实对话；不模拟接口、身份或助手输出。
 */
import { expect, test } from '@playwright/test';
import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { createTmuxSessionName } from '../../backend/server/terminal-tmux-runtime.ts';

const execFileAsync = promisify(execFile);
const projectPath = process.env.AGENTPORCH_TMUX_PROJECT_PATH || '';
const envFile = process.env.AGENTPORCH_TMUX_ENV_FILE || '';
const cardText = process.env.AGENTPORCH_TMUX_CARD_TEXT || '';
const evidenceDir = process.env.AGENTPORCH_TMUX_EVIDENCE_DIR;

test('主页重复进入同一真实Session 始终保留原窗口及Processes', async ({ page }) => {
  /** 使用部署令牌正常登录，再从主页点击卡片；只读 tmux 布局补充页面证据。 */
  test.skip(!projectPath || !envFile || !cardText, '需要提供隔离项目、登录配置和真实Session 卡片文本');
  const sessionName = createTmuxSessionName(`${projectPath}_codex_route:c1`);
  const listPanes = async () => {
    /** 窗口编号和进程编号同时不变，才能证明只是重新连接。 */
    const { stdout } = await execFileAsync('tmux', [
      'list-panes', '-s', '-t', sessionName, '-F', '#{window_id} #{window_name} #{pane_pid}',
    ]);
    return stdout.trim().split('\n').sort();
  };
  const before = await listPanes();
  expect(before).toHaveLength(1);
  const accessToken = (await readFile(envFile, 'utf8')).match(/^AGENTPORCH_ACCESS_TOKEN=(.+)$/m)?.[1].trim();
  expect(accessToken).toBeTruthy();
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Access token' }).fill(accessToken!);
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Access token' })).toBeHidden();
  const completeSetup = page.getByRole('button', { name: 'Complete Setup', exact: true });

  for (let entry = 0; entry < 2; entry += 1) {
    const output: string[] = [];
    page.on('websocket', (socket) => {
      /** 观察原生连接输出，不替换网络数据或终端实现。 */
      if (socket.url().includes('/shell')) socket.on('framereceived', ({ payload }) => output.push(String(payload)));
    });
    await page.goto('/');
    const card = page.getByRole('button').filter({ hasText: cardText });
    await Promise.race([
      completeSetup.waitFor({ state: 'visible' }),
      card.waitFor({ state: 'visible' }),
    ]);
    if (await completeSetup.isVisible()) await completeSetup.click();
    await card.click();
    await page.getByRole('button', { name: 'Shell', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Terminal input' })).toBeVisible();
    await expect.poll(() => output.some((frame) => frame.includes('READY')), { timeout: 30_000 }).toBe(true);
    const after = await listPanes();
    if (evidenceDir) {
      await mkdir(evidenceDir, { recursive: true });
      await page.screenshot({ path: path.join(evidenceDir, `terminal-${entry + 1}.png`) });
      await writeFile(path.join(evidenceDir, `windows-${entry + 1}.json`), JSON.stringify({ before, after }, null, 2) + '\n');
    }
    expect(after).toEqual(before);
  }
});
