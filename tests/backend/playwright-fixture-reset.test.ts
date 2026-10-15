import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, copyFile, rm, writeFile, access, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

test('browser fixture resets workflow classification without replacing an open auth database', async () => {
  const originalCwd = process.cwd();
  const originalStateHome = process.env.XDG_STATE_HOME;
  const directory = await mkdtemp(join(tmpdir(), 'agentporch-fixture-reset-'));
  await mkdir(join(directory, 'backend', 'database'), { recursive: true });
  await copyFile(join(dirname(fileURLToPath(import.meta.url)), '../../backend/database/init.sql'), join(directory, 'backend', 'database', 'init.sql'));
  let database: InstanceType<typeof Database> | undefined;
  try {
    process.chdir(directory);
    const { ensurePlaywrightFixture } = await import('../e2e/helpers/playwright-fixture.ts');
    const fixture = ensurePlaywrightFixture();
    database = new Database(fixture.authDbPath);
    const project = fixture.projectPaths[0];
    const userCount = database.prepare('SELECT COUNT(*) AS count FROM users').get();
    database.prepare(`INSERT INTO provider_session_index
      (provider, session_id, origin, project_path, normalized_project_path, file_path, last_activity)
      VALUES ('codex', 'fixture-reset-session', 'workflow', ?, ?, 'fixture.jsonl', '2026-01-01')`).run(project, project);
    database.prepare("INSERT INTO session_attention_ack (provider, session_id, manual_pending) VALUES ('codex', 'fixture-reset-session', 1)").run();
    database.prepare("INSERT INTO workflow_overview_index (normalized_project_path, run_id, project_path, workflow_json) VALUES (?, 'old-run', ?, '{}')").run(project, project);
    database.prepare("INSERT INTO workflow_batch_index (normalized_project_path, batch_id, project_path, batch_json) VALUES (?, 'old-batch', ?, '{}')").run(project, project);
    const piSession = join(fixture.homeDir, '.pi', 'agent', 'sessions', 'old-session.jsonl');
    await mkdir(dirname(piSession), { recursive: true });
    await writeFile(piSession, '{}\n');
    const watchedRoots = [join(fixture.homeDir, '.codex', 'sessions'), dirname(piSession)];
    const stablePaths = [...watchedRoots, project, join(watchedRoots[0], '2026', '04', '19', 'fixture-project-session.jsonl')];
    const rootInodes = await Promise.all(stablePaths.map(async root => (await stat(root)).ino));
    const leftover = join(project, 'previous-test.txt');
    await writeFile(leftover, 'previous test');
    ensurePlaywrightFixture({ preserveAuthDatabase: true });
    assert.deepEqual(await Promise.all(stablePaths.map(async root => (await stat(root)).ino)), rootInodes);
    await assert.rejects(access(leftover), { code: 'ENOENT' });
    await assert.rejects(access(piSession), { code: 'ENOENT' });
    assert.deepEqual(database.prepare('SELECT COUNT(*) AS count FROM users').get(), userCount);
    assert.equal(database.prepare("SELECT origin FROM provider_session_index WHERE session_id = 'fixture-reset-session'").get(), undefined);
    for (const table of ['session_attention_ack', 'workflow_overview_index', 'workflow_batch_index']) {
      assert.deepEqual(database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get(), { count: 0 });
    }
  } finally {
    database?.close();
    process.chdir(originalCwd);
    if (originalStateHome === undefined) delete process.env.XDG_STATE_HOME;
    else process.env.XDG_STATE_HOME = originalStateHome;
    await rm(directory, { recursive: true, force: true });
  }
});
