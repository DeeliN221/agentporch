/** Saved Codex turns remain ordered while terminal runtime events arrive and after a Render reload. */
import { test, expect } from '@playwright/test';
import { openFixtureProject, PRIMARY_FIXTURE_PROJECT_PATH } from './helpers/spec-test-helpers.ts';
import { PLAYWRIGHT_FIXTURE_HOME } from '../e2e/helpers/playwright-fixture.ts';
import { openCodexFixtureRoute } from './helpers/fixture-session-discovery.ts';
import { installProviderRuntimeHarness } from './helpers/provider-runtime-harness.ts';
import {
  writeCodexSessionFixture, appendCodexSessionEntries,
  codexUserMessageEntry, codexAssistantMessageEntry,
} from './helpers/codex-jsonl-fixture.ts';

for (const completed of [false, true]) {
  test(`Codex saved first turn survives ${completed ? 'completed' : 'in-progress'} follow-up events and reload`, async ({ page, request }) => {
    await openFixtureProject(page);
    await installProviderRuntimeHarness(page, {
      sentKey: '__followupSent', eventsKey: '__followupEvents',
      socketKey: '__followupSocket', emitKey: '__followupEmit',
    });
    const sessionId = `saved-followup-${completed}`;
    const sessionDay = ['2026', '06', '06'];
    const firstUser = 'Inspect the current state';
    const firstReply = 'Initial inspection is complete';
    const secondUser = 'Continue with the follow-up';
    const secondReply = 'Follow-up inspection is complete';
    await writeCodexSessionFixture({
      sessionId, projectPath: PRIMARY_FIXTURE_PROJECT_PATH, sessionDay,
      homeDir: PLAYWRIGHT_FIXTURE_HOME, timestamp: '2026-06-06T01:00:00.000Z',
      entries: [codexUserMessageEntry('2026-06-06T01:00:01.000Z', firstUser),
        codexAssistantMessageEntry('2026-06-06T01:00:02.000Z', firstReply)],
    });
    const route = await openCodexFixtureRoute(page, request, sessionId);
    const transcript = page.getByTestId('chat-scroll-container').last();
    await expect(transcript.getByText(firstReply, { exact: true })).toHaveCount(1);
    await expect(page.locator('textarea.chat-input-placeholder')).toHaveCount(0);
    await page.evaluate(({ routeId, text, complete }) => {
      const emit = (window as any).__followupEmit;
      for (let repeat = 0; repeat < 2; repeat += 1) {
        emit({ type: 'codex-response', provider: 'codex', sessionId: routeId, agentporchSessionId: routeId,
          data: { type: 'item', itemType: 'agent_message', message: { role: 'assistant', content: text } } });
      }
      if (complete) emit({ type: 'codex-complete', provider: 'codex', sessionId: routeId, status: 'completed' });
    }, { routeId: route.routeSessionId, text: secondReply, complete: completed });
    await expect(transcript.getByText(firstReply, { exact: true })).toHaveCount(1);
    await appendCodexSessionEntries(sessionId, [
      codexUserMessageEntry('2026-06-06T01:00:03.000Z', secondUser),
      codexAssistantMessageEntry('2026-06-06T01:00:04.000Z', secondReply),
    ], { sessionDay, homeDir: PLAYWRIGHT_FIXTURE_HOME });
    await page.reload({ waitUntil: 'networkidle' });
    for (const text of [firstUser, firstReply, secondUser, secondReply]) {
      await expect(transcript.getByText(text, { exact: true })).toHaveCount(1);
    }
    const text = await transcript.innerText();
    const positions = [firstUser, firstReply, secondUser, secondReply].map(value => text.indexOf(value));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    await expect(page.locator('textarea.chat-input-placeholder')).toHaveCount(0);
  });
}
