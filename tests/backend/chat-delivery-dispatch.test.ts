import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createChatCommandDispatcher } from '../../backend/server/realtime/chat-command-runtime.ts';
import { createSessionSubscriptionRegistry } from '../../backend/server/realtime/session-subscription-registry.ts';
const wait = async (predicate:()=>boolean) => {
  const end=Date.now()+5000;
  while(!predicate()) { if(Date.now()>end) throw new Error('Timed out'); await new Promise(r=>setTimeout(r,10)); }
};
test('retries execute once; reconnect replays in order and preserves disconnected owner/project isolation', async()=>{
  const clients=new Set<any>(); const users=new WeakMap<object,string|null>(); const writers:any[]=[]; const calls:any[]=[];
  const deps:any={connectedClients:clients,chatClientUsers:users,broadcastChatEvent:()=>{},sessionSubscriptionRegistry:createSessionSubscriptionRegistry(),
    resolveChatProjectOptions:async(o:any)=>o,extractProjectDirectory:()=>'',
    resolveAgentPorchSessionStartContext:(d:any)=>({agentporchSessionId:d.agentporchSessionId,routeInitToken:d.clientRequestId}),
    resolveAgentPorchRouteSessionIdFromProviderSession:async()=>'',isAgentPorchRouteSessionId:(s:string)=>/^c\d+$/.test(s),
    initManualSessionRoute:async()=>({started:true}),updateManualSessionTitleFromFirstRequest:async()=>{},
    normalizeManualProvider:(p:string)=>p,getSessionModelState:async()=>({}),
    sendNativeMessage:async(input:any)=>{calls.push(input);writers.push(input.writer);input.writer.send({type:'message-accepted',clientRequestId:input.clientRequestId});return {accepted:true};},
  };
  const connect=(user='alice')=>{ const events:any[]=[]; const socket:any={readyState:1,send:(s:string)=>events.push(JSON.parse(s))};
    return {events,socket,dispatcher:createChatCommandDispatcher(deps,socket,{user:{id:user}})}; };
  const source=connect(); const observer=connect(); const otherProject=connect(); const otherUser=connect('bob');
  const project=`/projects/delivery-${randomUUID()}`;
  const subscribe=(client:any,projectPath:string)=>client.dispatcher.dispatchChatCommand({type:'subscribe-session',provider:'codex',sessionId:'c1',projectPath});
  subscribe(observer,project);subscribe(otherProject,project+'-other');subscribe(otherUser,project);
  const command:any={type:'codex-command',agentporchSessionId:'c1',clientRequestId:randomUUID(),command:'hello',options:{projectName:'Delivery fixture',projectPath:project}};
  source.dispatcher.dispatchChatCommand(command); await wait(()=>calls.length===1 && source.events.some(e=>e.type==='message-accepted'));
  source.dispatcher.dispatchChatCommand(command); await wait(()=>source.events.filter(e=>e.type==='message-accepted').length===2);assert.equal(calls.length,1);
  const accepted=source.events.find(e=>e.type==='message-accepted');
  source.socket.readyState=3;source.dispatcher.close();
  writers[0].send({type:'codex-response',data:{text:'one'}});writers[0].send({type:'codex-response',data:{text:'two'}});
  assert.equal(observer.events.filter(e=>e.type==='codex-response').length,2);
  assert.equal(otherProject.events.filter(e=>e.type==='codex-response').length,0);
  assert.equal(otherUser.events.filter(e=>e.type==='codex-response').length,0);
  const reconnect=connect(); reconnect.dispatcher.dispatchChatCommand({type:'resume-chat',afterEventId:accepted.deliveryEventId,scopes:[{provider:'codex',sessionId:'c1',projectPath:project}]});
  await wait(()=>reconnect.events.some(e=>e.type==='chat-resumed'));
  assert.deepEqual(reconnect.events.filter(e=>e.type==='codex-response').map(e=>e.data.text),['one','two']);
  for(const client of [observer,otherProject,otherUser,reconnect]) client.dispatcher.close();
});
