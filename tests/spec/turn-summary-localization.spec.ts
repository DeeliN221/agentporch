/** Render the real summary component with synthetic usage, then switch the real i18n instance. */
import { test, expect } from '@playwright/test';
import { authenticatePage } from './helpers/spec-test-helpers.ts';

test('turn summaries switch Chinese/CNY and English/USD in both layouts', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await authenticatePage(page);
  await page.goto('/');
  await page.waitForSelector('#root');
  await page.evaluate(async () => {
    // Vite serves these source modules with the same React and i18n instances as the app.
    const load = (url: string) => import(/* @vite-ignore */ url);
    const reactModule = await load('/node_modules/.vite/deps/react.js');
    const React = reactModule.default || reactModule;
    const domModule = await load('/node_modules/.vite/deps/react-dom_client.js');
    const { createRoot } = domModule.default || domModule;
    const { default: Summary } = await load('/frontend/components/chat/view/subcomponents/TurnNonBodyGroup.tsx');
    const { default: i18n } = await load('/frontend/i18n/config.ts');
    await i18n.changeLanguage('zh-CN');
    const host = document.createElement('div');
    host.id = 'summary-localization-fixture';
    host.style.cssText = 'position:fixed;inset:0;z-index:99999;background:white;padding:24px;color:#111;';
    document.body.appendChild(host);
    const h = React.createElement;
    const summary = (kind: string) => h(Summary, {
      key: kind, blockIndex: 0, provider: 'codex', createDiff: () => [],
      block: { kind: 'turn-non-body-group', turnKey: kind, defaultOpen: false,
        processedDurationMs: 83000, model: 'gpt-5.6-sol',
        tokenUsage: { inputTokens: 1000, cachedInputTokens: 400, outputTokens: 100 },
        items: [{ kind, groupKey: kind, messages: [], commandCount: 1 }],
      },
    });
    createRoot(host).render(h('div', null,
      h('h1', null, 'Turn summary localization'),
      h('button', { onClick: () => i18n.changeLanguage('en') }, 'English'),
      h('button', { onClick: () => i18n.changeLanguage('zh-CN') }, '中文'),
      summary('thinking-group'), summary('tool-group'),
    ));
  });
  const fixture = page.locator('#summary-localization-fixture');
  for (const mobile of [false, true]) {
    await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 });
    await fixture.getByRole('button', { name: '中文', exact: true }).click();
    await expect(fixture.getByTestId('turn-non-body-elapsed')).toHaveText(['耗时 01分 23秒', '耗时 01分 23秒']);
    await expect(fixture.getByTestId('turn-non-body-cost')).toHaveText(['预估成本 ¥0.04', '预估成本 ¥0.04']);
    await expect(fixture.getByTestId('turn-non-body-cost').first()).toHaveAttribute('title', /并非实际账单/);
    await fixture.screenshot({ path: `/tmp/agentporch-summary-${mobile ? 'mobile' : 'desktop'}-zh.png` });
    await fixture.getByRole('button', { name: 'English', exact: true }).click();
    await expect(fixture.getByTestId('turn-non-body-elapsed')).toHaveText(['Duration 01m 23s', 'Duration 01m 23s']);
    await expect(fixture.getByTestId('turn-non-body-cost')).toHaveText(['Estimated cost $0.006', 'Estimated cost $0.006']);
    await expect(fixture.getByTestId('turn-non-body-cost').first()).toHaveAttribute('title', 'GPT-5.6 Sol estimated at standard USD rates; not an actual bill');
    await fixture.screenshot({ path: `/tmp/agentporch-summary-${mobile ? 'mobile' : 'desktop'}-en.png` });
  }
  expect(errors).toEqual([]);
});
