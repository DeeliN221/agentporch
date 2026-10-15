/** 文件目的：只运行已准备好真实会话的隔离实例验收，避免使用默认模拟环境。 */
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'tmux-home-reuse.spec.ts',
  timeout: 60_000,
  workers: 1,
  outputDir: '../test-results/tmux-home-reuse',
  use: {
    baseURL: process.env.AGENTPORCH_TMUX_BASE_URL || 'http://127.0.0.1:6186',
    viewport: { width: 1440, height: 960 },
    headless: true,
    launchOptions: process.env.AGENTPORCH_BROWSER_EXECUTABLE
      ? { executablePath: process.env.AGENTPORCH_BROWSER_EXECUTABLE }
      : {},
  },
});
