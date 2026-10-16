import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createChatDeliveryStore, serializeChatAdmission } from '../../backend/server/realtime/chat-delivery-store.ts';
import { ChatDeliveryClient } from '../../frontend/contexts/chatDeliveryClient.ts';
import { createSessionSubscriptionRegistry } from '../../backend/server/realtime/session-subscription-registry.ts';

const scope = { userId: 'alice', projectPath: '/projects/one', provider: 'codex', sessionId: 'c1' };
test('durable receipts survive restart, reject changed payloads and never re-execute uncertain requests', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'chat-delivery-'));
  let db = new Database(path.join(dir, 'delivery.db'));
  try {
    let store = createChatDeliveryStore(db);
    assert.equal(store.claim(scope, 'r1', {text:'hello'}).kind, 'new');
    assert.equal(store.claim(scope, 'r1', {text:'hello'}).kind, 'duplicate');
    assert.equal(store.claim(scope, 'r1', {text:'different'}).kind, 'conflict');
    store.append(scope, {type:'message-accepted',clientRequestId:'r1',nativeSessionId:'thread-1'});
    const event = store.append(scope, {type:'codex-response',data:'text',clientRequestId:'r1'});
    store.claim(scope, 'r2', {command:'pending'});
    store.append(scope, {type:'codex-complete',clientRequestId:'r1'});
    db.close(); db = new Database(path.join(dir,'delivery.db')); store = createChatDeliveryStore(db);
    const duplicate = store.claim(scope,'r1',{text:'hello'});
    assert.equal(duplicate.kind,'duplicate');
    if(duplicate.kind === 'duplicate') assert.equal(duplicate.receipt.type,'message-accepted');
    const uncertain=store.claim(scope,'r2',{command:'pending'});
    assert.equal(uncertain.kind,'uncertain');
    if(uncertain.kind==='uncertain') assert.equal(uncertain.originalCommand,'pending');
    assert.equal(store.binding(scope),'thread-1');
    assert.equal(store.claim(scope,'r3',{command:'pending'}).kind,'new');
    assert.equal(store.replay(scope,event.deliveryEventId,store.head()).length,1);
    for(const other of [{...scope,userId:'bob'},{...scope,projectPath:'/projects/two'},{...scope,provider:'pi'},{...scope,sessionId:'c2'}]) {
      assert.equal(store.replay(other,0,store.head()).length,0);
      assert.equal(store.claim(other,'r1',{text:'hello'}).kind,'new');
    }
  } finally { db.close(); rmSync(dir,{recursive:true,force:true}); }
});

test('admission remains FIFO across clients and recovers after failed initialization', async () => {
  const order: number[] = [];
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release=resolve; });
  const first = serializeChatAdmission(scope,async()=>{order.push(1); await gate; throw new Error('init failure');});
  const failed = first.catch(()=>{});
  const second = serializeChatAdmission(scope,async()=>{order.push(2);});
  const independent = serializeChatAdmission({...scope,sessionId:'c2'},async()=>{order.push(3);});
  await independent; assert.deepEqual(order,[1,3]); release(); await Promise.all([failed,second]); assert.deepEqual(order,[1,3,2]);
});

test('browser outbox survives reload, scopes receipts, and deduplicates replay without replaying history on reload', () => {
  const values = new Map<string,string>();
  const storage = { getItem:(key:string)=>values.get(key)||null,setItem:(key:string,value:string)=>{values.set(key,value);},removeItem:(key:string)=>{values.delete(key);} };
  const command = { type:'claude-command',clientRequestId:'r1',agentporchSessionId:'c1',options:{projectPath:'/projects/one'},command:'hello' };
  let client = new ChatDeliveryClient(storage,'alice'); client.remember(command);
  assert.equal(client.requests().length,1);
  client = new ChatDeliveryClient(storage,'alice');
  assert.equal(client.requests().length,1);
  assert.deepEqual(client.resumeMessage().scopes,[]);
  assert.equal(client.resumeMessage().scopes.length,1);
  const accepted = {type:'message-accepted',provider:'claude',projectPath:'/projects/one',agentporchSessionId:'c1',clientRequestId:'r1',deliveryEventId:5};
  client.receive({...accepted,projectPath:'/projects/two',deliveryEventId:4});
  assert.equal(client.requests().length,1);
  assert.equal(client.receive(accepted),true); assert.equal(client.receive(accepted),false);
  assert.equal(client.requests().length,0);
  assert.equal(new ChatDeliveryClient(storage,'bob').requests().length,0);
  assert.equal(new ChatDeliveryClient(storage,'alice').requests().length,0);
});

test('private subscriptions require the same user, project and provider even when cN collides', () => {
  const registry=createSessionSubscriptionRegistry(); const client={};
  registry.setClientScope(client,scope);
  assert.equal(registry.clientMatchesSession(client,scope),true);
  for(const other of [{...scope,userId:'bob'},{...scope,userId:null},{...scope,projectPath:'/projects/two'},{...scope,provider:'pi'}]) assert.equal(registry.clientMatchesSession(client,other),false);
});

test('late and duplicate acknowledgements never confirm a different pending message', async () => {
  const { markAcceptedUserMessageSent } = await import('../../frontend/components/chat/state/chatMessageReducer.ts');
  const rows:any[]=[{type:'user',content:'first',clientRequestId:'r1',deliveryStatus:'failed'},
    {type:'user',content:'second',clientRequestId:'r2',deliveryStatus:'pending'}];
  const accepted=markAcceptedUserMessageSent(rows,'r1');
  assert.equal(accepted[0].deliveryStatus,'persisted'); assert.equal(accepted[1].deliveryStatus,'pending');
  assert.deepEqual(markAcceptedUserMessageSent(accepted,'r1'),accepted);
  assert.deepEqual(markAcceptedUserMessageSent(accepted,'unknown'),accepted);
});

test('uncertain sends retain their text after reload and are not automatically retried', () => {
  const values = new Map<string,string>();
  const storage = { getItem:(key:string)=>values.get(key)||null,setItem:(key:string,value:string)=>{values.set(key,value);},removeItem:(key:string)=>{values.delete(key);} };
  const command = {type:'pi-command',clientRequestId:'uncertain',agentporchSessionId:'c1',options:{projectPath:'/projects/one'},command:'Keep this text'};
  let client=new ChatDeliveryClient(storage,'alice');client.remember(command);
  client.receive({type:'message-rejected',reason:'uncertain',error:'Check history',provider:'pi',projectPath:'/projects/one',agentporchSessionId:'c1',clientRequestId:'uncertain'});
  client=new ChatDeliveryClient(storage,'alice');assert.equal(client.requests().length,0);
  const failures=client.failures();
  assert.equal(failures.length,1);assert.equal(failures[0].originalCommand,'Keep this text');
  assert.equal(failures[0].projectPath,'/projects/one');
  client.dismissFailure(failures[0]);
  assert.equal(new ChatDeliveryClient(storage,'alice').failures().length,0);
});
