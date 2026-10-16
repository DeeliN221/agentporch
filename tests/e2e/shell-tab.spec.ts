// @ts-nocheck -- Test typing: parameter annotations pending.
/**
 * 文件目的：验证终端作为主工作区视图打开，移动端辅助按键仍可输入。
 * 业务意义：桌面终端不再固定到底部 dock，记录/详情与终端通过主视图切换。
 */
import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { createTmuxTerminalRuntime } from '../../backend/server/terminal-tmux-runtime';
import fs from 'node:fs/promises';
import path from 'node:path';
import { openFixtureProject } from '../spec/helpers/spec-test-helpers.ts';

process.env.DATABASE_PATH = path.join(process.env.HOME || '', '.agentporch', 'auth.db');

const [{ generateToken }, { userDb }] = await Promise.all([
  import('../../backend/middleware/auth.ts'),
  import('../../backend/database/db.ts'),
]);

/**
 * Build a valid local auth token for the first active user.
 */
function createLocalAuthToken() {
  const user = userDb.getFirstUser();
  if (!user) {
    throw new Error('No active user found for Playwright authentication');
  }

  return generateToken(user);
}

const AUTH_TOKEN = createLocalAuthToken();

test.beforeEach(async ({ page }: { page: any }) => {
  await page.addInitScript((token) => {
    window.localStorage.setItem('auth-token', token);
    window.localStorage.removeItem('agentporch:workspace-layout:v1');
    window.localStorage.removeItem('activeTab');
    window.__sentShellInputData = [];

    const NativeWebSocket = window.WebSocket;
    class TrackedWebSocket extends NativeWebSocket {
      constructor(...args) {
        super(...args);
        window.__trackedSockets = window.__trackedSockets || [];
        window.__trackedSockets.push(this);
      }

      send(data) {
        try {
          const message = typeof data === 'string' ? JSON.parse(data) : null;
          if (typeof this.url === 'string' && this.url.includes('/shell') && message?.type === 'input') {
            window.__sentShellInputData.push(message.data);
          }
        } catch {
          // Ignore non-JSON websocket payloads.
        }

        return super.send(data);
      }
    }

    Object.setPrototypeOf(TrackedWebSocket, NativeWebSocket);
    window.WebSocket = TrackedWebSocket;
  }, AUTH_TOKEN);
});

/**
 * 打开稳定项目并等待工作区工具栏可用。
 */
async function openShellProject(page) {
  await openFixtureProject(page, { expandWorkflows: false });
  await expect(page.getByRole('button', { name: /^Shell$|^终端$/ })).toBeVisible({ timeout: 10_000 });
}

/**
 * 等待终端 WebSocket 连接建立。
 */
async function waitForOpenShellSocket(page) {
  await page.waitForFunction(
    () => {
      const sockets = window.__trackedSockets || [];
      return sockets.some((socket) => typeof socket.url === 'string' && socket.url.includes('/shell') && socket.readyState === 1);
    },
    { timeout: 15_000 },
  );
}

test('desktop shell opens as main workspace terminal without lower dock', async ({ page }: { page: any }) => {
  await openShellProject(page);
  await page.getByRole('button', { name: /^Shell$|^终端$/ }).click();

  await expect(page.locator('.xterm')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('[data-testid="dock-panel-lower"]')).not.toBeVisible();
  await expect(page.locator('[data-testid="tab-shell"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('main, body')).not.toContainText(/Disconnect|断开连接|Restart|重启/);
});

test('desktop shell main view keeps one websocket while staying in workspace', async ({ page }: { page: any }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openShellProject(page);
  await page.getByRole('button', { name: /^Shell$|^终端$/ }).click();

  await expect(page.locator('.xterm')).toBeVisible({ timeout: 10_000 });
  await waitForOpenShellSocket(page);
  const shellSocketCountBefore = await page.evaluate(() => {
    const sockets = window.__trackedSockets || [];
    return sockets.filter((socket) => typeof socket.url === 'string' && socket.url.includes('/shell')).length;
  });

  await page.waitForTimeout(300);
  await expect.poll(async () => page.evaluate(() => {
    const sockets = window.__trackedSockets || [];
    return sockets.filter((socket) => typeof socket.url === 'string' && socket.url.includes('/shell')).length;
  })).toBe(shellSocketCountBefore);

  const terminalBox = await page.locator('.xterm').boundingBox();
  expect(terminalBox?.width).toBeGreaterThan(700);
  expect(terminalBox?.height).toBeGreaterThan(300);
});

test('Ctrl+V uploads a browser clipboard image and inserts its path into the terminal', async ({ page, context }: { page: any; context: any }) => {
  /** Public browser paste must upload the image instead of asking the server-side TUI for its clipboard. */
  await openShellProject(page);
  await page.getByRole('button', { name: /^Shell$|^终端$/ }).click();
  await waitForOpenShellSocket(page);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);

  const terminal = page.locator('.xterm');
  await expect(terminal).toBeVisible({ timeout: 10_000 });
  const uploadResponse = page.waitForResponse((response) => (
    response.url().includes('/upload-attachments') && response.request().method() === 'POST'
  ));
  await page.evaluate(async () => {
    const png = Uint8Array.from(atob(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    ), (character) => character.charCodeAt(0));
    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': new Blob([png], { type: 'image/png' }) }),
    ]);
  });
  await terminal.click();
  await page.keyboard.press('Control+V');

  const response = await uploadResponse;
  expect(response.ok()).toBe(true);
  const payload = await response.json();
  const uploadRoot = String(payload.rootPath || '');
  const pastedPath = String(payload.attachments?.[0]?.absolutePath || '');
  expect(pastedPath).not.toBe('');

  try {
    await expect.poll(() => page.evaluate((expectedPath) => (
      window.__sentShellInputData.some((input) => input.includes(`@${expectedPath}`))
    ), pastedPath)).toBe(true);
    await expect.poll(() => page.evaluate(() => window.__sentShellInputData)).not.toContain('\x16');
  } finally {
    if (uploadRoot.includes('/agentporch-uploads/')) {
      await fs.rm(uploadRoot, { recursive: true, force: true });
    }
  }
});

for (const width of [1440, 390]) {
  test(`stored session opens its rendered history without starting a terminal (${width}px)`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await openShellProject(page);
    await page.getByTestId('project-overview-manual-sessions')
      .getByRole('button', { name: /fixture-project manu/i }).first().click();

    await expect(page.getByTestId('tab-chat')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('web-chat')).toBeVisible();
    await expect(page.getByTestId('web-chat')).toContainText('fixture-project manual-only session');
    await expect(page.getByTestId('web-chat').locator('textarea.chat-input-placeholder')).toBeVisible();
    await expect(page.locator('.xterm')).toHaveCount(0);
    expect(await page.evaluate(() => (window.__trackedSockets || [])
      .filter((socket) => String(socket.url).includes('/shell')).length)).toBe(0);
    await page.screenshot({ path: testInfo.outputPath('history-default.png') });
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.getByTestId('web-chat')).toContainText('fixture-project manual-only session');
    await expect(page.getByTestId('web-chat').locator('textarea.chat-input-placeholder')).toBeVisible();
    await expect(page.locator('.xterm')).toHaveCount(0);
  });
}

test('mobile shell helper keys send escape tab arrows and held ctrl arrow input', async ({ page }: { page: any }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openShellProject(page);
  await page.getByRole('button', { name: /^Shell$|^终端$/ }).click();

  await waitForOpenShellSocket(page);
  const keybar = page.getByTestId('shell-mobile-keybar');
  await expect(keybar).toBeVisible({ timeout: 10_000 });
  await expect(keybar.getByRole('button')).toHaveCount(7);

  await page.getByTestId('shell-mobile-key-escape').click();
  await page.getByTestId('shell-mobile-key-tab').click();
  await page.getByTestId('shell-mobile-key-arrowUp').click();

  const ctrlButton = page.getByTestId('shell-mobile-key-ctrl');
  await ctrlButton.click();
  await expect(ctrlButton).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('shell-mobile-key-arrowRight').click();
  await expect(ctrlButton).toHaveAttribute('aria-pressed', 'true');
  await ctrlButton.click();
  await expect(ctrlButton).toHaveAttribute('aria-pressed', 'false');

  await expect.poll(async () => page.evaluate(() => {
    const sent = window.__sentShellInputData || [];
    return {
      hasEscape: sent.includes('\x1b'),
      hasTab: sent.includes('\t'),
      hasArrowUp: sent.includes('\x1b[A'),
      hasCtrlArrowRight: sent.includes('\x1b[1;5C'),
    };
  })).toEqual({
    hasEscape: true,
    hasTab: true,
    hasArrowUp: true,
    hasCtrlArrowRight: true,
  });
});

test('mobile viewport lets the software keyboard resize content above the helper keybar', async ({ page }: { page: any }) => {
  /** Android 软键盘必须缩放页面内容，不能覆盖布局视口底部。 */
  await page.setViewportSize({ width: 390, height: 844 });
  await openShellProject(page);
  await page.getByRole('button', { name: /^Shell$|^终端$/ }).click();

  const viewportContent = await page.locator('meta[name="viewport"]').getAttribute('content');
  expect(viewportContent).toContain('interactive-widget=resizes-content');
  const keybar = page.getByTestId('shell-mobile-keybar');
  await expect(keybar).toBeVisible({ timeout: 10_000 });
  await page.locator('.xterm-helper-textarea').focus();
  await page.setViewportSize({ width: 390, height: 520 });
  await expect.poll(async () => keybar.evaluate((element) => ({
    bottom: element.getBoundingClientRect().bottom,
    viewportHeight: window.innerHeight,
  }))).toMatchObject({ bottom: 520, viewportHeight: 520 });

  await page.screenshot({
    path: 'test-results/browser-evidence/20260717-0829-codex-session-mobile-keyboard/screenshots/mobile-keybar-above-keyboard.png',
    fullPage: true,
  });
});

test('mobile touch scroll is forwarded to TMux while mouse tracking is active', async ({ page }: { page: any }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openShellProject(page);
  await page.getByRole('button', { name: /^Shell$|^终端$/ }).click();

  await waitForOpenShellSocket(page);
  const terminal = page.locator('.xterm');
  await expect(terminal).toBeVisible({ timeout: 10_000 });
  await terminal.click();
  const runtime = createTmuxTerminalRuntime(`${path.join(process.env.HOME!, 'workspace', 'fixture-project')}_plain-shell_new`);
  await expect.poll(() => {
    try { return execFileSync('tmux', ['list-clients', '-t', runtime.sessionName, '-F', '#{client_tty}'], { encoding: 'utf8' }).trim(); }
    catch { return ''; }
  }).not.toBe('');
  await page.keyboard.press('Control+c');
  await page.keyboard.type("clear; for i in $(seq 1 160); do printf 'mobile-touch-line-%03d\\n' \"$i\"; done");
  await page.keyboard.press('Enter');
  // xterm/WebSocket visibility precedes tmux attachment and stale-pane cleanup.
  // Configure the live session only after its shell has executed our command.
  await expect(terminal).toContainText('mobile-touch-line-160');
  execFileSync('tmux', ['set-option', '-t', runtime.sessionName, 'mouse', 'on']);
  await expect(terminal).toHaveClass(/enable-mouse-events/, { timeout: 10_000 });

  await page.evaluate(() => {
    window.__sentShellInputData = [];
  });

  await terminal.evaluate((element) => {
    /** Dispatch one real DOM touch event at the supplied terminal coordinate. */
    const dispatchTouch = (type: string, clientY: number) => {
      const bounds = element.getBoundingClientRect();
      const touch = new Touch({
        identifier: 1,
        target: element,
        clientX: bounds.left + bounds.width / 2,
        clientY,
        pageX: bounds.left + bounds.width / 2,
        pageY: clientY,
      });
      element.dispatchEvent(new TouchEvent(type, {
        bubbles: true,
        cancelable: true,
        touches: type === 'touchend' ? [] : [touch],
        changedTouches: [touch],
      }));
    };

    const bounds = element.getBoundingClientRect();
    dispatchTouch('touchstart', bounds.top + bounds.height * 0.35);
    dispatchTouch('touchmove', bounds.top + bounds.height * 0.55);
    dispatchTouch('touchmove', bounds.top + bounds.height * 0.75);
    dispatchTouch('touchend', bounds.top + bounds.height * 0.75);
  });

  await expect.poll(async () => page.evaluate(() => (
    (window.__sentShellInputData || []).some((data) => data.includes('\x1b[<64;'))
  ))).toBe(true);

  await page.screenshot({
    path: 'test-results/browser-evidence/20260711-1447-mobile-terminal-touch-scroll/screenshots/mobile-terminal-touch-scroll.png',
    fullPage: true,
  });
});
