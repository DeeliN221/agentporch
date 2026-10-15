/**
 * Purpose: Keep test classification, commands and source directory names stable.
 * Business scenarios: A reviewer can identify backend, specification, browser and manual risks.
 * Reviewer risk: A broken taxonomy hides the correct test command and guide.
 * Business scenarios: Default commands continue to cover all required regression layers.
 * Failure meaning: Tests moved to the root, stale scripts or outdated guides violate the contract.
 * Business scenarios: Source names must agree across development, packaging and documentation.
 * Reviewer benefit: These assertions make repository organization executable.
 * Failure meaning: Missing guidance prevents assessment of real user impact.
 * Sources: taxonomy proposals 2026-06-05-74, 2026-06-06-81, 2026-06-06-84,
 * 2026-06-06-85 and 2026-06-17-24; historical originals are retained outside the public tree.
 * Reads the real source tree, test tree and runner configuration, not copies.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const TESTS_DIR = path.join(REPO_ROOT, 'tests');

const EXECUTABLE_TEST_PATTERN = /\.(test|spec)\.ts$/;
const ENGLISH_TEXT_PATTERN = /[A-Za-z]{3,}/;
const COMMENT_LINE_PATTERN = /^\s*(\/\/|\/\*|\*|#)/;
const STALE_TEST_PREFIX_PATTERN = /^(?:test_)?\d{4}-\d{2}-\d{2}-/;
const BACKEND_TEST_GLOB = 'tests/backend/*.test.ts';
const SERVER_SMOKE_TEST_FILES = [
  'tests/backend/dist-server-entrypoint.test.ts',
  'tests/backend/pi-session-messages-endpoint.test.ts',
  'tests/backend/pi-sessions-read-model.test.ts',
  'tests/backend/provider-session-change.test.ts',
  'tests/backend/sessions.test.ts',
] as const;
const SERVER_TEST_COMMAND = `rm -rf .tmp/test-db/server && DATABASE_PATH=.tmp/test-db/server/agentporch.db tsx --test --test-concurrency=1 ${BACKEND_TEST_GLOB}`;
const SPEC_NODE_TEST_COMMAND = 'rm -rf .tmp/test-db/spec-node && DATABASE_PATH=.tmp/test-db/spec-node/agentporch.db tsx --test $(node scripts/list-node-spec-tests.mjs)';
const ACTIVE_PATH_CONTRACT_ROOTS = ['backend', 'frontend', 'tests', 'scripts'];
const CATEGORY_GUIDES = [
  {
    path: 'tests/backend/README.md',
    requiredTerms: ['Business scenarios', 'Commands', 'Failure meaning', 'Adding tests', 'API'],
  },
  {
    path: 'tests/unit/README.md',
    requiredTerms: ['Business scenarios', 'Commands', 'Failure meaning', 'Adding tests', 'Vitest'],
  },
  {
    path: 'tests/spec/README.md',
    requiredTerms: ['Business scenarios', 'Commands', 'Failure meaning', 'Adding tests', 'specification'],
  },
  {
    path: 'tests/e2e/README.md',
    requiredTerms: ['Business scenarios', 'Commands', 'Failure meaning', 'Adding tests', 'end-to-end'],
  },
  {
    path: 'tests/manual/README.md',
    requiredTerms: ['Business scenarios', 'Commands', 'Failure meaning', 'Adding tests', 'manual'],
  },
] as const;
const REPRESENTATIVE_TESTS_WITH_BUSINESS_COMMENTS = [
  {
    path: 'tests/backend/pi-session-messages-endpoint.test.ts',
    businessTerms: ['Business scenarios', 'Failure meaning', 'user'],
  },
  {
    path: 'tests/spec/test_suite_taxonomy.ts',
    businessTerms: ['Business scenarios', 'Failure meaning', 'reviewer'],
  },
  {
    path: 'tests/e2e/pi-provider-business-flow.spec.ts',
    businessTerms: ['Business scenarios', 'Failure meaning', 'user'],
  },
  {
    path: 'tests/manual/node-history/live-transcript-order.contract.test.ts',
    businessTerms: ['Business scenarios', 'Failure meaning', 'historical regression'],
  },
] as const;

/**
 * Recursively collect files beneath a directory using stable relative paths.
 */
async function collectFiles(dir: string, baseDir = dir): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const absolutePath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return collectFiles(absolutePath, baseDir);
      }
      return [path.relative(baseDir, absolutePath).split(path.sep).join('/')];
    }),
  );
  return files.flat().sort();
}

/**
 * Report whether a repository-relative path exists.
 */
async function pathExists(relativePath: string): Promise<boolean> {
  try {
    await fs.access(path.join(REPO_ROOT, relativePath));
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

/**
 * Return executable test files from the repository test tree.
 */
async function collectExecutableTests(): Promise<string[]> {
  const files = await collectFiles(TESTS_DIR);
  return files.filter((filePath) => EXECUTABLE_TEST_PATTERN.test(filePath));
}

/**
 * Render a compact list so taxonomy failures remain readable in CI logs.
 */
function renderSample(paths: string[], limit = 20): string {
  const visible = paths.slice(0, limit).map((filePath) => `  - tests/${filePath}`);
  const hidden = paths.length > limit ? [`  ... and ${paths.length - limit} more`] : [];
  return [...visible, ...hidden].join('\n');
}

/**
 * Read active code, script, test, and packaging files that describe repository paths.
 */
async function readActivePathContractFiles(): Promise<Array<{ file: string; content: string }>> {
  const files = (
    await Promise.all(ACTIVE_PATH_CONTRACT_ROOTS.map((root) => collectFiles(path.join(REPO_ROOT, root), REPO_ROOT)))
  ).flat()
    .filter((filePath) => /\.(ts|tsx|js|jsx|sh)$/.test(filePath));

  files.push('.npmignore');

  return Promise.all(
    files.map(async (filePath) => ({
      file: filePath,
      content: await fs.readFile(path.join(REPO_ROOT, filePath), 'utf8'),
    })),
  );
}

/**
 * Read the root test-suite guide and fail with a business-facing message when
 * the classification guide is missing.
 */
async function readTestGuide(): Promise<string> {
  const readmePath = path.join(TESTS_DIR, 'README.md');
  try {
    return await fs.readFile(readmePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      assert.fail('tests/README.md must explain category responsibilities, commands and where to add tests');
    }
    throw error;
  }
}

/**
 * Read a repository-relative text file and fail with a business-facing message
 * when required taxonomy documentation is missing.
 */
async function readRequiredText(relativePath: string): Promise<string> {
  // Missing guides or representative sources must identify the context reviewers lost.
  try {
    return await fs.readFile(path.join(REPO_ROOT, relativePath), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      assert.fail(`${relativePath} is missing; reviewers need the test guide or representative source`);
    }
    throw error;
  }
}

/**
 * Extract English comment lines from source text.
 */
function collectEnglishCommentLines(source: string): string[] {
  // Count only source comments for reviewers, not test names or assertion strings.
  return source
    .split('\n')
    .filter((line) => COMMENT_LINE_PATTERN.test(line) && ENGLISH_TEXT_PATTERN.test(line));
}

/**
 * Assert that documentation text contains every required business term.
 */
function assertContainsTerms(text: string, terms: readonly string[], owner: string): void {
  // Required terms document risks, entry points and rules for adding tests.
  for (const term of terms) {
    assert.match(text, new RegExp(term), `${owner} must contain "${term}"`);
  }
}

test('executable tests do not live directly under tests', async () => {
  const executableTests = await collectExecutableTests();
  const rootTests = executableTests.filter((filePath) => !filePath.includes('/'));

  // Business scenarios: Root guides lead reviewers to the correct risk category.
  // Failure meaning: Root tests blur default and manual entry boundaries.
  assert.equal(
    rootTests.length,
    0,
    `Executable tests must belong to tests/backend, tests/spec, tests/e2e or tests/manual; root files: ${rootTests.length} files:\n${renderSample(rootTests)}`,
  );
});

test('source roots identify frontend and backend responsibilities', async () => {
  assert.equal(await pathExists('backend'), true, 'backend/ must exist as the backend source root');
  assert.equal(await pathExists('frontend'), true, 'frontend/ must exist as the frontend source root');
  assert.equal(await pathExists('server'), false, 'server/ must not remain a source root');
  assert.equal(await pathExists('src'), false, 'src/ must not remain a source root');
});

test('tests/README.md describes real category responsibilities and commands', async () => {
  const readme = await readTestGuide();
  const requiredText = [
    'non-specialist reviewers',
    'Reading order',
    'real business requirements',
    'not just component smoke',
    'tests/backend/README.md',
    'tests/unit/README.md',
    'tests/spec/README.md',
    'tests/e2e/README.md',
    'tests/manual/README.md',
    'tests/backend',
    'tests/unit',
    'tests/spec',
    'tests/e2e',
    'tests/manual',
    'pnpm run test:server',
    BACKEND_TEST_GLOB,
    'pnpm run test:vitest',
    'pnpm run test:spec:node',
    'pnpm run test:spec:browser',
    'pnpm run test:e2e',
    'Node contracts in top-level non-`.spec.ts` files',
    'Do not place executable tests directly in the `tests/` root',
  ];

  for (const text of requiredText) {
    assert.match(readme, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  assert.equal(
    readme.includes(['`test_', '*.ts` run under Node'].join('')),
    false,
    'README must not describe the obsolete test_*.ts Node entry',
  );
});

test('the fast Vitest entry covers only tests/unit, excluding stateful tests', async () => {
  const [packageRaw, vitestConfig] = await Promise.all([
    fs.readFile(path.join(REPO_ROOT, 'package.json'), 'utf8'),
    fs.readFile(path.join(REPO_ROOT, 'vitest.config.ts'), 'utf8'),
  ]);
  const packageJson = JSON.parse(packageRaw) as {
    scripts?: Record<string, string>;
  };

  // Business scenarios: Vitest provides fast pure-logic feedback, not stateful integration coverage.
  // Failure meaning: Broad includes incorrectly parallelize HOME, XDG, port, WebSocket or browser state.
  assert.equal(packageJson.scripts?.['test:vitest'], 'vitest run --config vitest.config.ts');
  assert.equal(packageJson.scripts?.['test:vitest:watch'], 'vitest --config vitest.config.ts');
  assert.match(packageJson.scripts?.['test:full'] ?? '', /pnpm run test:vitest/);
  assert.match(vitestConfig, /tests\/unit\/\*\*\/\*\.test\.ts/);
  assert.match(vitestConfig, /environment:\s*['"]node['"]/);
  assert.match(vitestConfig, /globals:\s*false/);
  assert.doesNotMatch(vitestConfig, /tests\/backend/);
  assert.doesNotMatch(vitestConfig, /tests\/e2e/);
  assert.doesNotMatch(vitestConfig, /tests\/manual/);
});

test('each test category has English guidance for scenarios, commands and failure meaning', async () => {
  for (const guide of CATEGORY_GUIDES) {
    const content = await readRequiredText(guide.path);
    const englishRatio = content.replace(/[^A-Za-z]/g, '').length / Math.max(content.length, 1);

    // Business scenarios: Category guides explain risks instead of listing commands alone.
    assert.ok(englishRatio > 0.4, `${guide.path} must contain English explanations, not only commands`);
    assertContainsTerms(content, guide.requiredTerms, guide.path);
  }
});

test('representative tests contain English comments explaining scenarios and failure risks', async () => {
  for (const representativeTest of REPRESENTATIVE_TESTS_WITH_BUSINESS_COMMENTS) {
    const source = await readRequiredText(representativeTest.path);
    const englishCommentLines = collectEnglishCommentLines(source);

    // Failure meaning: Missing comments hide the real user risk behind implementation details.
    assert.ok(
      englishCommentLines.length >= 8,
      `${representativeTest.path} requires at least 8 English business-comment lines; found ${englishCommentLines.length} lines`,
    );
    assertContainsTerms(englishCommentLines.join('\n'), representativeTest.businessTerms, representativeTest.path);
  }
});

test('server test guide and package scripts use the same real backend directory', async () => {
  const [packageRaw, readme, backendFiles] = await Promise.all([
    fs.readFile(path.join(REPO_ROOT, 'package.json'), 'utf8'),
    readTestGuide(),
    collectFiles(path.join(TESTS_DIR, 'backend')),
  ]);
  const packageJson = JSON.parse(packageRaw) as {
    scripts?: Record<string, string>;
  };
  const backendTestCount = backendFiles.filter((filePath) => filePath.endsWith('.test.ts')).length;

  assert.equal(
    packageJson.scripts?.['test:server'],
    SERVER_TEST_COMMAND,
    'pnpm run test:server must run current backend tests with an isolated database',
  );
  assert.match(readme, /tests\/backend\/\*\.test\.ts/);
  assert.ok(backendTestCount > 0, 'tests/backend must contain executable tests, not only updated documentation');
});

test('Node test entries separate smoke, full regression and release builds', async () => {
  const [packageRaw, backendReadme, specReadme] = await Promise.all([
    fs.readFile(path.join(REPO_ROOT, 'package.json'), 'utf8'),
    readRequiredText('tests/backend/README.md'),
    readRequiredText('tests/spec/README.md'),
  ]);
  const packageJson = JSON.parse(packageRaw) as {
    scripts?: Record<string, string>;
  };

  const scripts = packageJson.scripts ?? {};
  const smokeCommand = `rm -rf .tmp/test-db/server-smoke && DATABASE_PATH=.tmp/test-db/server-smoke/agentporch.db tsx --test ${SERVER_SMOKE_TEST_FILES.join(' ')}`;

  // Business scenarios: Separate smoke, full Node regression and release build commands avoid duplicate builds.
  // Failure meaning: Mixed entries slow validation and obscure which stage failed.
  assert.match(scripts['build:server'] ?? '', /tsc -p tsconfig\.build\.json\b/);
  assert.match(scripts['build:server'] ?? '', /^node scripts\/clean-server-build\.mjs &&/);
  assert.doesNotMatch(scripts['build:server'] ?? '', /copy-build-runtime-js\.mjs/);
  assert.equal(scripts['test:server:smoke'], smokeCommand);
  assert.equal(scripts['test:server'], SERVER_TEST_COMMAND);
  assert.equal(scripts['test:node'], 'pnpm run test:server && pnpm run test:spec:node');
  assert.equal(scripts['test:spec:node'], SPEC_NODE_TEST_COMMAND);
  assert.doesNotMatch(scripts['test:spec:node'] ?? '', /build:server/);
  assert.match(scripts['test:unit'] ?? '', /test:server:smoke/);
  assert.match(backendReadme, /test:server:smoke/);
  assert.match(backendReadme, /not full regression/);
  assert.match(specReadme, /without an implicit server build/);
});

test('Playwright separates smoke, full regression and failure artifacts', async () => {
  const [packageRaw, smokeConfig, e2eConfig, e2eReadme] = await Promise.all([
    fs.readFile(path.join(REPO_ROOT, 'package.json'), 'utf8'),
    readRequiredText('playwright.smoke.config.ts'),
    readRequiredText('playwright.config.ts'),
    readRequiredText('tests/e2e/README.md'),
  ]);
  const packageJson = JSON.parse(packageRaw) as {
    scripts?: Record<string, string>;
  };
  const scripts = packageJson.scripts ?? {};

  // Business scenarios: Fast browser feedback complements full pre-merge browser and end-to-end coverage.
  // Failure meaning: A weakened entry can skip real flows or generate excessive artifacts on success.
  assert.equal(scripts['test:e2e:smoke'], 'playwright test --config=playwright.smoke.config.ts');
  assert.equal(scripts['test:browser:full'], 'pnpm run test:spec:browser && pnpm run test:e2e');
  assert.equal(scripts['test:spec:browser'], 'playwright test --config=playwright.spec.config.ts');
  assert.equal(scripts['test:e2e'], 'playwright test');
  assert.match(smokeConfig, /playwright\.config/);
  assert.match(smokeConfig, /testDir:\s*['"]\.\/tests\/e2e['"]/);
  assert.match(smokeConfig, /project-visibility\.spec\.ts/);
  assert.match(smokeConfig, /pi-provider-business-flow\.spec\.ts/);
  assert.doesNotMatch(smokeConfig, /manual\/browser-history/);
  assert.match(e2eConfig, /trace:\s*['"]retain-on-failure['"]/);
  assert.match(e2eConfig, /screenshot:\s*['"]only-on-failure['"]/);
  assert.match(e2eConfig, /video:\s*['"]retain-on-failure['"]/);
  assert.match(e2eReadme, /test:e2e:smoke/);
  assert.match(e2eReadme, /test:browser:full/);
  assert.match(e2eReadme, /real pages|real business|end-to-end/);
  assert.match(e2eReadme, /smoke|fast|critical/);
});

test('quality gates expose reviewable timing profiles without weakening defaults', async () => {
  const [packageRaw, timingScript, performanceDocs] = await Promise.all([
    fs.readFile(path.join(REPO_ROOT, 'package.json'), 'utf8'),
    readRequiredText('scripts/collect-test-timings.ts'),
    readRequiredText('docs/testing-performance.md'),
  ]);
  const packageJson = JSON.parse(packageRaw) as {
    scripts?: Record<string, string>;
  };
  const scripts = packageJson.scripts ?? {};

  // Business scenarios: Measure performance without removing complete default regression coverage.
  // Failure meaning: Missing profiles or weakened defaults prevent meaningful timing review.
  assert.equal(scripts.test, 'pnpm run test:full');
  assert.equal(scripts['test:fast'], 'pnpm run typecheck && pnpm run test:vitest && pnpm run test:server:smoke');
  assert.equal(scripts['test:smoke'], 'pnpm run test:fast && pnpm run test:e2e:smoke');
  assert.match(scripts['test:full'] ?? '', /pnpm run typecheck/);
  assert.match(scripts['test:full'] ?? '', /pnpm run test:browser:full/);
  assert.equal(scripts['qa:test:timing:fast'], 'AGENTPORCH_TEST_TIMING_PROFILE=fast tsx scripts/collect-test-timings.ts');
  assert.equal(scripts['qa:test:timing:smoke'], 'AGENTPORCH_TEST_TIMING_PROFILE=smoke tsx scripts/collect-test-timings.ts');
  assert.equal(scripts['qa:test:timing:full'], 'AGENTPORCH_TEST_TIMING_PROFILE=full tsx scripts/collect-test-timings.ts');
  assert.match(timingScript, /AGENTPORCH_TEST_TIMING_PROFILE/);
  assert.match(timingScript, /test-results\/test-performance/);
  assert.match(timingScript, /failed\.length > 0/);
  assert.match(timingScript, /process\.exitCode = failed\[0\]\.exitCode \?\? 1/);
  assert.match(performanceDocs, /qa:test:timing:fast/);
  assert.match(performanceDocs, /fast\.json/);
  assert.match(performanceDocs, /smoke\.json/);
  assert.match(performanceDocs, /full\.json/);
});

test('runtime and build configuration use current source roots', async () => {
  const [packageRaw, devWatch, rewriteWebsocketHandlers, npmignore, tsconfigNode, tsconfigBuild, tsconfigWeb, tailwind, indexHtml] = await Promise.all([
    fs.readFile(path.join(REPO_ROOT, 'package.json'), 'utf8'),
    fs.readFile(path.join(REPO_ROOT, 'scripts/dev-watch.sh'), 'utf8'),
    fs.readFile(path.join(REPO_ROOT, 'scripts/rewrite-websocket-handlers.ts'), 'utf8'),
    fs.readFile(path.join(REPO_ROOT, '.npmignore'), 'utf8'),
    fs.readFile(path.join(REPO_ROOT, 'tsconfig.node.json'), 'utf8'),
    fs.readFile(path.join(REPO_ROOT, 'tsconfig.build.json'), 'utf8'),
    fs.readFile(path.join(REPO_ROOT, 'tsconfig.web.json'), 'utf8'),
    fs.readFile(path.join(REPO_ROOT, 'tailwind.config.ts'), 'utf8'),
    fs.readFile(path.join(REPO_ROOT, 'index.html'), 'utf8'),
  ]);
  const packageJson = JSON.parse(packageRaw) as {
    main?: string;
    bin?: { agentporch?: string };
    files?: string[];
    scripts?: Record<string, string>;
  };

  assert.equal(packageJson.main, 'dist-node/backend/index.js');
  assert.equal(packageJson.bin?.agentporch, 'dist-node/backend/cli.js');
  assert.equal(packageJson.scripts?.server, 'tsx backend/index.ts');
  assert.equal(packageJson.scripts?.['dev:watch'], './scripts/dev-watch.sh');
  assert.equal(packageJson.scripts?.['test:server'], SERVER_TEST_COMMAND);
  assert.equal(packageJson.scripts?.['test:spec:node'], SPEC_NODE_TEST_COMMAND);
  assert.ok(packageJson.files?.includes('dist-node/backend/'), 'npm package files must include executable backend artifacts');
  assert.equal(packageJson.files?.includes('backend/'), false, 'npm package files must exclude uncompiled backend sources');
  assert.equal(packageJson.files?.includes('server/'), false, 'npm package files must exclude the old server sources');
  assert.ok(devWatch.includes('pnpm exec tsx watch backend/index.ts'));
  assert.equal(devWatch.includes(['server', 'index.ts'].join('/')), false);
  assert.ok(rewriteWebsocketHandlers.includes("const file: string = 'backend/index.ts';"));
  assert.equal(rewriteWebsocketHandlers.includes(['server', 'index.ts'].join('/')), false);
  assert.ok(npmignore.includes('!backend/**/*.md'));
  assert.equal(npmignore.includes(['!server', '/'].join('')), false);
  assert.ok(tsconfigNode.includes('"backend/**/*.ts"'));
  assert.ok(tsconfigBuild.includes('"backend/**/*.ts"'));
  assert.ok(tsconfigWeb.includes('"frontend"'));
  assert.ok(tailwind.includes('./frontend/**/*.{js,ts,jsx,tsx}'));
  assert.ok(indexHtml.includes('/frontend/main.tsx'));
});

test('Playwright spec configuration does not enumerate historical root tests', async () => {
  const config = await fs.readFile(path.join(REPO_ROOT, 'playwright.spec.config.ts'), 'utf8');
  const rootHistoricalEntries = config
    .split('\n')
    .filter((line) => /^\s*['"]\d{4}-\d{2}-\d{2}-/.test(line));

  assert.equal(
    rootHistoricalEntries.length,
    0,
    `playwright.spec.config.ts must not enumerate historical tests at the tests root:\n${rootHistoricalEntries.join('\n')}`,
  );
});

test('test filenames do not retain date or test_date prefixes', async () => {
  const executableTests = await collectExecutableTests();
  const staleNames = executableTests.filter((filePath) =>
    STALE_TEST_PREFIX_PATTERN.test(path.basename(filePath)),
  );

  assert.equal(
    staleNames.length,
    0,
    `Test filenames must express business topics without date or test_date prefixes:\n${renderSample(staleNames)}`,
  );
});

test('active sources, scripts, packaging and test comments do not reference renamed paths', async () => {
  const stalePatterns = [
    /server\/index\b/,
    /(^|[^-\w])server\/session/,
    /dist-node\/server/,
    /src\/utils\/session-provider/,
    new RegExp(['!server', '/'].join('')),
  ];
  const files = await readActivePathContractFiles();
  const staleReferences = files.flatMap(({ file, content }) =>
    stalePatterns
      .filter((pattern) => pattern.test(content))
      .map((pattern) => `${file}: ${pattern}`),
  );

  assert.equal(
    staleReferences.length,
    0,
    `Active sources, scripts, packaging and comments must not reference old directory paths:\n${renderSample(staleReferences)}`,
  );
});
