// @ts-nocheck -- Playwright fixtures are exercised against the runtime app.
/**
 * PURPOSE: Verify project overview Pi session cards render provider activity
 * timestamps through the real browser path instead of showing stale sessions
 * as "just now".
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

import {
  ensurePlaywrightFixture,
  PLAYWRIGHT_FIXTURE_HOME,
} from './helpers/playwright-fixture.ts';
import {
  openFixtureProject,
  authHeaders,
  PRIMARY_FIXTURE_PROJECT_PATH,
} from '../spec/helpers/spec-test-helpers.ts';


/**
 * Write a minimal native Pi transcript that project discovery and overview
 * cards consume through /api/projects.
 */
async function writePiTranscript({
  sessionId,
  projectPath,
  title,
  sessionTimestamp,
  activityTimestamp,
}) {
  const sessionDir = path.join(PLAYWRIGHT_FIXTURE_HOME, '.pi', 'agent', 'sessions', '57-timestamp');
  const sessionFile = path.join(sessionDir, `${sessionId}.jsonl`);

  await fs.mkdir(sessionDir, { recursive: true });
  await fs.writeFile(
    sessionFile,
    [
      JSON.stringify({
        type: 'session',
        id: sessionId,
        cwd: projectPath,
        timestamp: sessionTimestamp,
      }),
      JSON.stringify({
        type: 'message',
        id: `${sessionId}-user`,
        timestamp: activityTimestamp,
        message: {
          role: 'user',
          content: [{ type: 'text', text: title }],
        },
      }),
      JSON.stringify({
        type: 'message',
        id: `${sessionId}-assistant`,
        timestamp: activityTimestamp,
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: `ack ${title}` }],
        },
      }),
    ].join('\n') + '\n',
    'utf8',
  );

  return sessionFile;
}

test('project overview Pi cards show real activity time before and after reload', async ({ page, request }, testInfo) => {
  ensurePlaywrightFixture({ preserveAuthDatabase: true });
  const nowMs = Date.now();
  const twoHoursAgo = new Date(nowMs - 2 * 60 * 60 * 1000).toISOString();
  const thirtyMinutesFuture = new Date(nowMs + 30 * 60 * 1000).toISOString();
  const sessions = [
    { sessionId: 'pi-timestamp-history', title: 'Historical Pi timestamp', timestamp: twoHoursAgo },
    { sessionId: 'pi-timestamp-future', title: 'Future Pi timestamp', timestamp: thirtyMinutesFuture },
  ];
  for (const session of sessions) {
    await writePiTranscript({ ...session, projectPath: PRIMARY_FIXTURE_PROJECT_PATH,
      sessionTimestamp: session.timestamp, activityTimestamp: session.timestamp });
  }
  // Publish newly written transcripts before opening the UI; list responses are
  // lightweight, so inspect provider timestamps through the overview endpoint.
  await openFixtureProject(page, { reset: false });
  for (const reload of [false, true]) {
    if (reload) await page.reload({ waitUntil: 'networkidle' });
    const overview = await request.get(`/api/projects/fixture-project/overview?${new URLSearchParams({ projectPath: PRIMARY_FIXTURE_PROJECT_PATH })}`, { headers: authHeaders() });
    expect(overview.ok()).toBeTruthy();
    const payload = await overview.json();
    for (const session of sessions) {
      const saved = payload.piSessions.find(item => item.id === session.sessionId || item.providerSessionId === session.sessionId);
      expect(saved).toBeDefined();
      expect(new Date(saved.lastActivity).getTime()).toBe(new Date(session.timestamp).getTime());
    }
    const cards = page.getByTestId('project-overview-manual-sessions');
    const historical = cards.getByRole('button', { name: 'Historical Pi timestamp', exact: true });
    const future = cards.getByRole('button', { name: 'Future Pi timestamp', exact: true });
    await expect(historical).toBeVisible();
    await expect(future).toBeVisible();
    await expect(historical).toContainText(/2\s*(小时|hours?)/i);
    await expect(historical).not.toContainText(/刚刚|just now/i);
    await expect(future).not.toContainText(/刚刚|just now/i);
  }
  await page.getByTestId('project-overview-manual-sessions').screenshot({ path: testInfo.outputPath('pi-activity-times.png') });
});
