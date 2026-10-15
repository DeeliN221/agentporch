/** Read-only history must never reuse the retired composer submission handlers. */
import { test, expect } from '@playwright/test';
import { openFixtureProject, openFixtureManualSessionFromOverview } from './helpers/spec-test-helpers';

for (const gesture of ['keyboard', 'paste', 'drop'] as const) {
  test(`readonly history ignores repeated ${gesture} input without sending or uploading`, async ({ page }) => {
    const submissions: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'POST' && /upload|attachment|chat|command/.test(new URL(request.url()).pathname)) submissions.push(request.url());
    });
    page.on('websocket', (socket) => socket.on('framesent', ({ payload }) => {
      if (typeof payload !== 'string') return;
      try {
        const event = JSON.parse(payload);
        if (/^(?:codex|pi|claude)-command$/.test(event.type)) submissions.push(payload);
      } catch { /* Terminal frames are outside the rendered history. */ }
    }));
    await openFixtureProject(page);
    await openFixtureManualSessionFromOverview(page);
    const pane = page.getByTestId('chat-rendered-snapshot-pane');
    await expect(pane).toContainText('fixture-project manual-only session assistant turn 01');
    const before = await pane.innerText();
    await expect(pane.locator('textarea, [contenteditable="true"]')).toHaveCount(0);
    for (let attempt = 0; attempt < 2; attempt++) {
      if (gesture === 'keyboard') {
        await pane.click({ position: { x: 4, y: 4 } });
        await page.keyboard.type('readonly-input-marker');
        await page.keyboard.press('Control+Enter');
      } else {
        await pane.evaluate((element, kind) => {
          const transfer = new DataTransfer();
          transfer.setData('text/plain', 'readonly-input-marker');
          transfer.items.add(new File(['fixture attachment'], 'readonly-fixture.txt', { type: 'text/plain' }));
          if (kind === 'paste') {
            element.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }));
          } else {
            element.dispatchEvent(new DragEvent('dragover', { dataTransfer: transfer, bubbles: true, cancelable: true }));
            element.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }));
          }
        }, gesture);
      }
    }
    await expect(pane).not.toContainText('readonly-input-marker');
    await expect(pane).toHaveText(before, { useInnerText: true });
    expect(submissions).toEqual([]);
    await page.reload({ waitUntil: 'networkidle' });
    await expect(pane).toContainText('fixture-project manual-only session assistant turn 01');
    await expect(pane).not.toContainText('readonly-input-marker');
  });
}
