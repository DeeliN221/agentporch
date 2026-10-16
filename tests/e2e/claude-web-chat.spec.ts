/** Real UI, upload API and CLI process; only the model is replaced by a fixture. */
import { test, expect } from '@playwright/test';
import { authenticatePage, getFixtureProject } from '../spec/helpers/spec-test-helpers.ts';
import { buildProjectRoute } from '../../frontend/utils/projectRoute.ts';
for (const mobile of [false, true]) {
  test(`Claude web chat uploads, resumes and stops (${mobile ? 'mobile' : 'desktop'})`, async ({ page }, info) => {
    test.setTimeout(120_000);
    await page.setViewportSize(mobile ? {width:390,height:844} : {width:1280,height:900});
    const errors: string[] = [];
    const providerIds = new Set<string>();
    page.on('websocket', socket => socket.on('framereceived', frame => {
      try { const event = JSON.parse(String(frame.payload)); if(event.type === 'session-created' && event.provider === 'claude') providerIds.add(event.sessionId); } catch { /* Ignore non-JSON frames. */ }
    }));
    page.on('pageerror', error => errors.push(error.message));
    await authenticatePage(page);
    await page.goto(buildProjectRoute(await getFixtureProject(page.request)));
    await page.getByTestId('project-new-session-button').click();
    await expect(page.getByTestId('project-new-session-provider-claude')).toBeVisible({timeout:15_000});
    await page.getByTestId('project-new-session-provider-claude').click();
    const input = page.locator('textarea.chat-input-placeholder');
    await expect(input).toBeVisible({timeout:30_000});
    await expect(page.locator('.xterm')).toHaveCount(0);
    await input.fill('Please review the attached notes.');
    await page.locator('input[type=file]:not([webkitdirectory])').first().setInputFiles({name:'review-notes.txt',mimeType:'text/plain',buffer:Buffer.from('Review the upload flow.')});
    const upload = page.waitForResponse(r=>r.url().includes('upload-attachments'),{timeout:15_000});
    await page.getByRole('button',{name:/^Send(?: message)?$/,exact:true}).click();
    expect((await upload).ok()).toBeTruthy();
    await expect(page.getByTestId('web-chat')).toContainText('Claude reviewed the attached notes.',{timeout:30_000});
    await expect(page.getByTestId('web-chat')).toContainText('Read');
    await expect(page.getByTestId('web-chat').getByText('Claude reviewed the attached notes.',{exact:true})).toHaveCount(1);
    await page.screenshot({path:info.outputPath(`claude-${mobile ? 'mobile' : 'desktop'}.png`)});
    const route = new URL(page.url()).pathname;
    await page.reload();
    await expect(input).toBeVisible();
    await expect(page.getByTestId('web-chat')).toContainText('Claude reviewed the attached notes.');
    await input.fill('Continue reviewing.');
    await page.getByRole('button',{name:/^Send(?: message)?$/,exact:true}).click();
    await expect(page.getByTestId('web-chat')).toContainText('Resumed Claude conversation.');
    expect(new URL(page.url()).pathname).toBe(route);
    expect(providerIds.size).toBe(1);
    await input.fill('Hold this request');
    await page.getByRole('button',{name:/^Send(?: message)?$/,exact:true}).click();
    await expect(page.getByRole('button',{name:/Stop|Abort/i}).first()).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button',{name:/Stop|Abort/i}).first()).toBeVisible();
    // The composer suppresses click-through for 400ms when Stop replaces Send.
    await page.waitForTimeout(450);
    await page.getByRole('button',{name:/Stop|Abort/i}).first().click();
    await expect(page.getByRole('button',{name:/^Send(?: message)?$/,exact:true})).toBeVisible();
    expect(errors).toEqual([]);
  });
}
