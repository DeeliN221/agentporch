/**
 * PURPOSE: Verify explicit Claude history remains available through the project facade.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  deleteProviderSessionIndexFile,
  getSessionMessages,
  indexProviderSessionFile,
} from '../../backend/projects.ts';

test('explicit Claude history is paginated through the project facade', { concurrency: false }, async () => {
  /** Enabled Claude history is read only on explicit request through the shared pagination entry point. */
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentporch-legacy-claude-history-'));
  const originalHome = process.env.HOME;
  const originalDatabase = process.env.DATABASE_PATH;
  const sessionId = 'legacy-claude-session';
  const transcriptPath = path.join(homeDir, '.claude', 'projects', 'legacy', `${sessionId}.jsonl`);
  try {
    process.env.HOME = homeDir;
    process.env.DATABASE_PATH = path.join(homeDir, '.agentporch', 'agentporch.db');
    await fs.mkdir(path.dirname(transcriptPath), { recursive: true });
    await fs.writeFile(transcriptPath, [
      JSON.stringify({ sessionId, cwd: '/workspace/legacy', type: 'user', message: { role: 'user', content: '第一页' } }),
      JSON.stringify({ sessionId, cwd: '/workspace/legacy', type: 'assistant', message: { role: 'assistant', content: '第二页' } }),
    ].join('\n').concat('\n'), 'utf8');
    await indexProviderSessionFile('claude', transcriptPath);

    const page = await getSessionMessages('legacy-project', sessionId, 1);
    assert.equal(page.messages.length, 1);
    assert.equal(page.messages[0].provider, 'claude');
    assert.equal(page.hasMore, true);
  } finally {
    await deleteProviderSessionIndexFile('claude', transcriptPath);
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    if (originalDatabase === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = originalDatabase;
    await fs.rm(homeDir, { recursive: true, force: true });
  }
});
