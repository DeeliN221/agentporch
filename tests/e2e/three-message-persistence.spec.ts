/** Three saved provider turns survive history reload without loss, reordering, or duplicates. */
import { test, expect } from '@playwright/test';
import { openFixtureProject } from '../spec/helpers/spec-test-helpers.ts';
import { writeProviderHistory } from './helpers/provider-history-fixture.ts';

for (const provider of ['codex', 'pi'] as const) {
  test(`${provider} history preserves three consecutive saved turns after reload`, async ({ page }) => {
    await openFixtureProject(page);
    const turns = [1, 2, 3].map(index => ({ prompt: `${provider} request ${index}`, reply: `${provider} saved reply ${index}` }));
    const route = await writeProviderHistory(provider, `three-saved-turns-${provider}`, turns);
    await openFixtureProject(page, { reset: false });
    await page.goto(route, { waitUntil: 'networkidle' });
    const transcript = page.getByTestId('chat-scroll-container').last();
    for (const reload of [false, true]) {
      if (reload) await page.reload({ waitUntil: 'networkidle' });
      for (const turn of turns) {
        await expect(transcript.getByText(turn.prompt, { exact: true })).toHaveCount(1);
        await expect(transcript.getByText(turn.reply, { exact: true })).toHaveCount(1);
      }
      const text = await transcript.innerText();
      const positions = turns.flatMap(turn => [text.indexOf(turn.prompt), text.indexOf(turn.reply)]);
      expect(positions).toEqual([...positions].sort((a, b) => a - b));
      await expect(page.locator('textarea.chat-input-placeholder')).toHaveCount(0);
      await expect(page.locator('.xterm')).toHaveCount(0);
    }
  });
}
