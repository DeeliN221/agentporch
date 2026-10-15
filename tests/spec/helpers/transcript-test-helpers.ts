import { expect, type Page } from '@playwright/test';

/** Open the persisted turn details before inspecting individual tools or reasoning. */
export async function expandTranscriptDetails(page: Page) {
  const transcript = page.getByTestId('chat-rendered-snapshot-pane');
  await expect(transcript).toBeVisible();
  await expect(transcript).not.toHaveAttribute('data-snapshot-version', '0');
  await expect(transcript.getByTestId(/^(turn-non-body-toggle|turn-tool-list-toggle)$/).first()).toBeVisible();
  for (const toggle of await transcript.getByTestId(/^(turn-non-body-toggle|turn-tool-list-toggle)$/).all()) {
    if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
  }
  await expect(transcript.getByTestId(/^(turn-tool-group|turn-tool-list)$/).first()).toBeVisible();
  for (const group of await transcript.getByTestId(/^(turn-tool-group|turn-tool-list)$/).all()) {
    if (await group.getAttribute('open') === null) await group.locator(':scope > summary').click();
  }
}
