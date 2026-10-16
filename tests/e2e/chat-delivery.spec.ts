/** Fault injection at the socket boundary; real UI/API with fixture providers. */
import { test, expect } from '@playwright/test';
import { authenticatePage, getFixtureProject } from '../spec/helpers/spec-test-helpers.ts';
import { buildProjectRoute } from '../../frontend/utils/projectRoute.ts';

for (const provider of ['claude', 'pi', 'codex']) {
  test(`${provider}: lost acknowledgement, duplicate send and disconnected output recover once`, async ({page}) => {
    test.setTimeout(120_000);
    const errors:string[]=[]; page.on('pageerror',e=>errors.push(e.message));
    let duplicated=false, lostAck=false, cut=false, commands=0;
    const requests=new Set<string>();
    await page.routeWebSocket('**/ws', socket => {
      const server=socket.connectToServer();
      socket.onMessage(raw=>{
        const event=JSON.parse(String(raw));
        server.send(raw);
        if(event.type === `${provider}-command`) {
          commands++;requests.add(event.clientRequestId);
          if(!duplicated) { duplicated=true;server.send(raw); }
        }
      });
      server.onMessage(raw=>{
        const event=JSON.parse(String(raw));
        if(event.type==='message-accepted' && !cut) {lostAck=true;return;}
        if(event.type===`${provider}-response` && !cut) {
          cut=true; socket.close(); server.close(); return;
        }
        socket.send(raw);
      });
    });
    await authenticatePage(page);
    await page.goto(buildProjectRoute(await getFixtureProject(page.request)));
    await page.getByTestId('project-new-session-button').click();
    await page.getByTestId(`project-new-session-provider-${provider}`).click();
    const input=page.locator('textarea.chat-input-placeholder');
    await expect(input).toBeVisible({timeout:30_000});
    const prompt=`Delivery recovery ${provider}`;
    await input.fill(prompt);
    await page.getByRole('button',{name:/^Send(?: message)?$/,exact:true}).click();
    const reply=provider==='claude'?'Claude reviewed the attached notes.':`fake ${provider} response:`;
    await expect(page.getByTestId('web-chat')).toContainText(reply,{timeout:60_000});
    await expect.poll(()=>cut).toBeTruthy();
    await expect(page.getByRole('button',{name:/^Send(?: message)?$/,exact:true})).toBeVisible({timeout:30_000});
    expect(duplicated && lostAck).toBeTruthy();
    expect(requests.size).toBe(1);
    expect(commands).toBeGreaterThanOrEqual(2);
    await expect.poll(()=>page.evaluate(()=>Object.keys(sessionStorage).filter(k=>k.startsWith('agentporch-chat-outbox:')).every(k=>JSON.parse(sessionStorage.getItem(k)||'[]').length===0))).toBeTruthy();
    await page.reload();
    await expect(input).toBeVisible();
    await expect(page.getByTestId('web-chat')).toContainText(reply,{timeout:30_000});
    await expect(page.getByTestId('web-chat').getByText(prompt,{exact:true})).toHaveCount(1);
    expect(errors).toEqual([]);
  });
}

for (const mobile of [false,true]) test(`failed initialization keeps the original message after refresh (${mobile ? 'mobile' : 'desktop'})`,async({page},info)=>{
  test.setTimeout(60_000);
  await page.setViewportSize(mobile ? {width:390,height:844} : {width:1280,height:900});
  await authenticatePage(page);await page.goto(buildProjectRoute(await getFixtureProject(page.request)));
  await page.getByTestId('project-new-session-button').click();await page.getByTestId('project-new-session-provider-claude').click();
  const input=page.locator('textarea.chat-input-placeholder');await expect(input).toBeVisible();
  await input.fill('Reject before initialization');await page.getByRole('button',{name:/^Send(?: message)?$/,exact:true}).click();
  await expect(page.getByTestId('web-chat')).toContainText('Fixture initialization failed');
  await expect(page.getByRole('button',{name:/^Send(?: message)?$/,exact:true})).toBeVisible();
  await page.reload();await expect(input).toBeVisible();
  await expect(page.getByTestId('delivery-recovery')).toContainText('Original message: Reject before initialization');
  await page.getByTestId('web-chat').screenshot({path:info.outputPath('delivery-recovery.png')});
  await page.getByRole('button',{name:'Use as draft',exact:true}).click();
  await expect(input).toHaveValue('Reject before initialization');
  await page.getByRole('button',{name:'Dismiss',exact:true}).click();
  await expect(page.getByTestId('delivery-recovery')).toHaveCount(0);
});
