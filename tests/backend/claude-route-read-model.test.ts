/** A persisted Claude binding must survive a reload before transcript indexing catches up. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createManualSessionDraft, bindManualSessionProvider, finalizeManualSessionRoute, getClaudeSessions } from '../../backend/projects.ts';

test('Claude list retains the stable cN route and native UUID after binding', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'claude-route-'));
  const previousState = process.env.XDG_STATE_HOME;
  process.env.XDG_STATE_HOME = path.join(root, 'state');
  try {
    const projectPath = path.join(root, 'project');
    const draft = await createManualSessionDraft('test-project', projectPath, 'claude', 'Review notes');
    const providerId = randomUUID();
    await bindManualSessionProvider('test-project', projectPath, draft.id, providerId);
    await finalizeManualSessionRoute('test-project', draft.id, providerId, 'claude', projectPath);
    const sessions = await getClaudeSessions(projectPath, {skipProviderScan:true});
    const session = sessions.find(s=>s.providerSessionId===providerId);
    assert.ok(session);
    assert.equal(session.provider,'claude');
    assert.equal(`c${session.routeIndex}`,draft.id);
    assert.equal(session.id,providerId);
  } finally {
    if(previousState === undefined) delete process.env.XDG_STATE_HOME;
    else process.env.XDG_STATE_HOME=previousState;
    await rm(root,{recursive:true,force:true});
  }
});
