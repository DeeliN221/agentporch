/** Long Pi history renders saved thinking, tool cards, and conclusions across reload. */
import { test, expect } from '@playwright/test';
import { openFixtureProject } from '../spec/helpers/spec-test-helpers.ts';
import { expandTranscriptDetails } from '../spec/helpers/transcript-test-helpers.ts';
import { writeProviderHistory } from './helpers/provider-history-fixture.ts';

test('Pi preserves three long saved turns with thinking and tools after reload', async ({ page }) => {
  test.setTimeout(60_000);
  await openFixtureProject(page);
  const turns = [1, 2, 3].map(index => ({
    prompt: `Pi long request ${index}: inspect the current project and provide detailed observations.`,
    thinking: `Pi reasoning for turn ${index}`,
    command: `printf pi-long-tool-${index}`,
    output: `pi-long-tool-${index}`,
    reply: `Pi conclusion ${index}. ` + `Detailed observation for turn ${index}. `.repeat(30),
  }));
  const route = await writeProviderHistory('pi', 'pi-three-long-saved-turns', turns);
  await openFixtureProject(page, { reset: false });
  await page.goto(route, { waitUntil: 'networkidle' });
  const transcript = page.getByTestId('chat-scroll-container').last();
  for (const reload of [false, true]) {
    if (reload) await page.reload({ waitUntil: 'networkidle' });
    await expandTranscriptDetails(page);
    for (const turn of turns) {
      await expect(transcript.getByText(turn.prompt, { exact: true })).toHaveCount(1);
      await expect(transcript.getByText(turn.reply, { exact: true })).toHaveCount(1);
      await expect(transcript).toContainText(turn.thinking);
      const card = transcript.getByTestId('codex-tool-card').filter({ hasText: turn.command });
      await expect(card).toHaveCount(1);
      await card.getByRole('button', { name: 'Show output' }).click();
      await expect(card.locator('[id^="tool-result-"] pre')).toContainText(turn.output);
    }
    const text = await transcript.innerText();
    const positions = turns.map(turn => text.indexOf(turn.prompt));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  }
});
