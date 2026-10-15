import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeProjectLocalConfig } from '../../backend/project-config-store.ts';
import { getSessionModelState, updateSessionModelState } from '../../backend/domains/projects/project-config-read-model.ts';

test('model state round trips through provider IDs and canonical chat routes', async () => {
  const stateHome = await mkdtemp(join(tmpdir(), 'agentporch-model-state-'));
  const previousStateHome = process.env.XDG_STATE_HOME;
  process.env.XDG_STATE_HOME = stateHome;
  const projectPath = join(stateHome, 'project');
  try {
    await writeProjectLocalConfig(projectPath, {
      schemaVersion: 2,
      chat: { 1: { provider: 'codex', sessionId: 'provider-session', providerSessionId: 'provider-session' } },
    });
    await updateSessionModelState(projectPath, 'provider-session', { model: 'fixture-model', reasoningEffort: 'medium' });
    assert.equal((await getSessionModelState(projectPath, 'provider-session')).reasoningEffort, 'medium');
    assert.equal((await getSessionModelState(projectPath, 'c1')).reasoningEffort, 'medium');
    await updateSessionModelState(projectPath, 'c1', { reasoningEffort: 'high' });
    assert.equal((await getSessionModelState(projectPath, 'provider-session')).reasoningEffort, 'high');
    assert.deepEqual(await getSessionModelState(projectPath, 'unknown'), {});
  } finally {
    if (previousStateHome === undefined) delete process.env.XDG_STATE_HOME;
    else process.env.XDG_STATE_HOME = previousStateHome;
    await rm(stateHome, { recursive: true, force: true });
  }
});
