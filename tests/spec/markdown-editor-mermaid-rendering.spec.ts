// @ts-nocheck -- strict:true enabled; incremental tightening tracked.
/**
 * PURPOSE: Acceptance tests for Mermaid and PlantUML rendering in workspace markdown preview.
 * Derived from openspec/changes/1-add-markdown-editor-mermaid-rendering/specs/markdown-editor-mermaid-rendering/spec.md.
 */
import { test, expect } from '@playwright/test';
import {
  authenticatePage,
  openFilesTab,
  openFixtureProject,
  resetWorkspaceProject,
  writeWorkspaceTextFile,
} from './helpers/spec-test-helpers.ts';

const PLANTUML_SOURCE = '@startuml\nAlice -> Bob: rendered in editor\n@enduml';
/**
 * Click a visible file-tree row by its displayed entry name.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} entryName
 * @returns {Promise<void>}
 */
async function clickFileTreeEntry(page, entryName) {
  await page.locator('div.cursor-pointer')
    .filter({ has: page.getByText(entryName, { exact: true }) })
    .first()
    .click();
}

/**
 * Open a markdown file from the workspace and switch the editor into preview mode.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} relativePath
 * @param {string} content
 * @returns {Promise<import('@playwright/test').Locator>}
 */
async function openMarkdownPreview(page, relativePath, content) {
  await openFixtureProject(page);
  await writeWorkspaceTextFile(relativePath, content);
  await openFilesTab(page);
  await page.getByRole('button', { name: /^Reload$/i }).click();
  const fileName = relativePath.split('/').at(-1);
  await clickFileTreeEntry(page, 'docs');
  await clickFileTreeEntry(page, fileName);
  await page.locator('button[title=\"Preview markdown\"]').click();

  return page.locator('.prose').last();
}

test.beforeEach(async ({ page }) => {
  /** 为每个预览场景恢复隔离工作区并建立已登录浏览器状态。 */
  await resetWorkspaceProject();
  await authenticatePage(page);
});

test('markdown preview renders valid mermaid fenced blocks as diagrams', async ({ page }) => {
  /** Scenario: Rendering a Mermaid flowchart in markdown preview */
  const preview = await openMarkdownPreview(
    page,
    'docs/architecture.md',
    [
      '# Architecture',
      '',
      '```mermaid',
      'flowchart LR',
      '  Start[Start] --> Done[Done]',
      '```',
      '',
      'The editor preview should show the diagram above.',
    ].join('\n'),
  );

  await expect(preview.getByText('Architecture', { exact: true })).toBeVisible();
  await expect(preview.locator('.markdown-mermaid-diagram svg')).toBeVisible();
  await expect(preview.getByText('Start', { exact: true })).toBeVisible();
  await expect(preview.getByText('Done', { exact: true })).toBeVisible();
});

test('markdown preview keeps non-mermaid fenced blocks as ordinary code content', async ({ page }) => {
  const plantumlRequests = [];
  page.on('request', (request) => {
    if (request.url().includes('/vendor/plantuml/')) plantumlRequests.push(request.url());
  });
  /** Scenario: Keeping ordinary fenced code blocks unchanged */
  const preview = await openMarkdownPreview(
    page,
    'docs/code-sample.md',
    [
      '# Code Sample',
      '',
      '```js',
      'export const format = "plain-code";',
      '```',
    ].join('\n'),
  );

  await expect(preview.getByText('Code Sample', { exact: true })).toBeVisible();
  await expect(preview.getByText('javascript', { exact: true })).toBeVisible();
  await expect(preview.getByText('export const format = "plain-code";', { exact: true })).toBeVisible();
  await expect(preview.locator('svg')).toHaveCount(0);
  expect(plantumlRequests).toEqual([]);
});

test('markdown preview renders a mixed-case PlantUML alias as a loaded image with working controls', async ({ page }) => {
  /** 场景：验证 puml 大小写别名走服务端渲染，并可缩放和切换全屏。 */

  const preview = await openMarkdownPreview(
    page,
    'docs/plantuml-preview.md',
    [
      '# PlantUML Preview',
      '',
      '```pUmL',
      ...PLANTUML_SOURCE.split('\n'),
      '```',
    ].join('\n'),
  );

  const diagram = preview.locator('.markdown-plantuml-diagram').locator('xpath=../..');
  const image = preview.locator('.markdown-plantuml-diagram img');
  await expect(image).toBeVisible();
  await expect(image).toHaveJSProperty('complete', true);
  await expect.poll(() => image.evaluate((element) => element.naturalWidth)).toBeGreaterThan(0);
  const svg = await image.evaluate(async (element) => (await fetch(element.src)).text());
  expect(svg).toContain('rendered in editor');


  const zoomButton = diagram.getByRole('button', { name: 'Reset zoom' });
  await diagram.getByRole('button', { name: 'Zoom in' }).click();
  await expect(zoomButton).toContainText('125%');
  await zoomButton.click();
  await expect(zoomButton).toContainText('100%');

  await diagram.getByRole('button', { name: 'Fullscreen', exact: true }).click();
  await expect(diagram).toHaveClass(/fixed/);
  await diagram.getByRole('button', { name: 'Exit fullscreen' }).click();
  await expect(diagram.getByRole('button', { name: 'Fullscreen', exact: true })).toBeVisible();
});

test('markdown preview renders concurrent diagrams locally without a rendering API', async ({ page }) => {
  /** 场景：真实引擎同时生成中文时序图、类图与内置 C4 图，不访问外部服务。 */
  const forbidden = [];
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.pathname === '/api/diagrams/plantuml') {
      forbidden.push(url.href);
      await route.abort();
    } else await route.continue();
  });
  const sources = [
    '@startuml\n用户 -> 工作台: 中文验证\n@enduml',
    '@startuml\nclass Order\nclass Item\nOrder --> Item\n@enduml',
    '@startuml\n!include <C4/C4_Context>\nPerson(user, "Customer")\nSystem(app, "Workbench")\nRel(user, app, "Uses")\n@enduml',
  ];
  const preview = await openMarkdownPreview(page, 'docs/local-diagrams.md',
    sources.map((source) => '```plantuml\n' + source + '\n```').join('\n\n'));
  const images = preview.locator('.markdown-plantuml-diagram img');
  await expect(images).toHaveCount(3);
  for (let index = 0; index < 3; index++) {
    const image = images.nth(index);
    await expect.poll(() => image.evaluate((element) => element.naturalWidth)).toBeGreaterThan(0);
    const svg = await image.evaluate(async (element) => (await fetch(element.src)).text());
    expect(svg).toContain(['中文验证', 'Order', 'Customer'][index]);
  }
  expect(forbidden).toEqual([]);
});

test('markdown preview preserves invalid PlantUML source and surrounding content', async ({ page }) => {
  /** 场景：语法错误只影响当前图表，并保留缩进供用户修正。 */
  const invalidSource = '@startuml\n  this is invalid PlantUML syntax ?!\n@enduml';
  const preview = await openMarkdownPreview(page, 'docs/plantuml-invalid.md',
    ['# Invalid PlantUML', '```plantuml', invalidSource, '```', 'Still readable.'].join('\n'));
  await expect(preview.getByText('Unable to render PlantUML diagram.', { exact: true })).toBeVisible();
  await expect(preview.locator('pre code')).toContainText('  this is invalid PlantUML syntax ?!');
  await expect(preview.getByText('Still readable.', { exact: true })).toBeVisible();
});

test('markdown preview preserves source when the bundled engine cannot load', async ({ page }) => {
  /** 场景：本地静态资源不可用时显示回退，而不尝试公共服务器。 */
  await page.route('**/plantuml-browser.js', (route) => route.abort());
  const preview = await openMarkdownPreview(page, 'docs/plantuml-load-error.md',
    ['```plantuml', PLANTUML_SOURCE, '```'].join('\n'));
  await expect(preview.getByText('Unable to render PlantUML diagram.', { exact: true })).toBeVisible();
  await expect(preview.locator('pre code')).toContainText('Alice -> Bob');
});

test('markdown preview parses frontmatter as metadata before rendering body', async ({ page }) => {
  /** Scenario: Rendering YAML frontmatter separately from markdown body */
  const preview = await openMarkdownPreview(
    page,
    'docs/frontmatter.md',
    [
      '---',
      'title: Frontmatter note',
      'tags:',
      '  - docs',
      '  - preview',
      'draft: false',
      '---',
      '# Body Heading',
      '',
      'Body paragraph should render normally.',
    ].join('\n'),
  );

  const metadata = preview.getByTestId('markdown-frontmatter');
  await expect(metadata).toBeVisible();
  await expect(metadata.getByText('title', { exact: true })).toBeVisible();
  await expect(metadata.getByText('Frontmatter note', { exact: true })).toBeVisible();
  await expect(metadata.getByText('tags', { exact: true })).toBeVisible();
  await expect(metadata.getByText('docs, preview', { exact: true })).toBeVisible();
  await expect(metadata.getByText('draft', { exact: true })).toBeVisible();
  await expect(preview.getByRole('heading', { name: 'Body Heading' })).toBeVisible();
  await expect(preview.getByText('Body paragraph should render normally.', { exact: true })).toBeVisible();
  await expect(preview.locator('hr')).toHaveCount(0);
});

test('markdown preview shows a visible fallback when a mermaid block is invalid', async ({ page }) => {
  /** Scenario: Showing a fallback for invalid Mermaid source */
  const preview = await openMarkdownPreview(
    page,
    'docs/broken-diagram.md',
    [
      '# Broken Diagram',
      '',
      '```mermaid',
      'flowchart LR',
      '  Start[Start] -->',
      '```',
      '',
      'Preview should still render this paragraph.',
    ].join('\n'),
  );

  await expect(preview.getByText('Broken Diagram', { exact: true })).toBeVisible();
  await expect(preview.getByText('Unable to render Mermaid diagram.', { exact: true })).toBeVisible();
  await expect(preview.getByText('Start[Start] -->', { exact: true })).toBeVisible();
  await expect(preview.getByText('Preview should still render this paragraph.', { exact: true })).toBeVisible();
});
