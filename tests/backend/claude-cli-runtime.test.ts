/** Exercise the real child-process protocol without a paid model or host credentials. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, chmod, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { sendClaudeMessage, abortClaudeSession, getClaudeSessionStatus, closeClaudeSessions } from '../../backend/domains/provider-runtime/claude-cli-runtime.ts';

async function waitFor(predicate: () => boolean) {
  const until = Date.now() + 5000;
  while (!predicate()) { if (Date.now() > until) throw new Error('Timed out waiting for Claude runtime'); await new Promise(r => setTimeout(r, 10)); }
}

test('Claude streams, resumes by UUID, rejects concurrent writers, and aborts without terminal input', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'claude-protocol-'));
  const previousPath = process.env.PATH;
  const previousEnvFile = process.env.AGENTPORCH_CLAUDE_ENV_FILE;
  try {
    const cli = path.join(dir, 'claude');
    await writeFile(cli, `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
if(args[0] === '--version') { console.log('test Claude Code'); process.exit(0); }
const id = args[args.indexOf(args.includes('--resume') ? '--resume' : '--session-id') + 1];
let text = '';
process.stdin.on('data', c => text += c);
process.stdin.on('end', () => {
 fs.appendFileSync('calls.jsonl', JSON.stringify({args,text,environmentMarker:process.env.CLAUDE_TEST_MARKER})+'\\n');
 const send = x => console.log(JSON.stringify(x));
 if(text === 'before-init') { process.exitCode=1; return; }
 send({type:'system',subtype:'init',session_id:id});
 if(text === 'malformed') { console.log('not-json'); return; }
 if(text === 'silent') return;
 if(text === 'hold') { setInterval(()=>{},1000); return; }
 if(text === 'fail') { send({type:'result',subtype:'error_during_execution',is_error:true,errors:['test auth failure']}); return; }
 send({type:'stream_event',event:{type:'content_block_delta',delta:{text:'Hello'}}});
 send({type:'stream_event',event:{type:'content_block_stop'}});
 send({type:'assistant',message:{content:[{type:'text',text:'Hello'},{type:'tool_use',id:'tool-1',name:'Read',input:{file_path:'notes.txt'}}]}});
 send({type:'user',message:{content:[{type:'tool_result',tool_use_id:'tool-1',content:'notes'}]}});
 send({type:'result',subtype:'success',session_id:id});
});
`);
    await chmod(cli, 0o755);
    const envFile = path.join(dir, 'provider settings.sh');
    await writeFile(envFile, 'export CLAUDE_TEST_MARKER=fixture-loaded\n');
    process.env.AGENTPORCH_CLAUDE_ENV_FILE=envFile;
    process.env.PATH = `${dir}${path.delimiter}${previousPath}`;
    const events: any[] = [];
    const send = (text: string, id = 'c1', providerSessionId?: string) => sendClaudeMessage({sessionId:id, providerSessionId, projectPath:dir,text,writer:{send:e=>events.push(e)}});
    assert.equal((await send('first $(literal)')).accepted, true);
    await waitFor(() => events.some(e => e.type === 'claude-complete'));
    const created = events.find(e => e.type === 'session-created').sessionId;
    assert.match(created, /^[\da-f-]{36}$/);
    const assistant = events.find(e => e.data?.content?.some((p:any)=>p.type==='tool_use'));
    assert.deepEqual(assistant.data.content.map((p:any)=>p.type), ['tool_use']);
    assert.ok(events.some(e=>e.data?.content?.some((p:any)=>p.type==='tool_result')));
    events.length=0;
    await send('hold');
    await waitFor(()=>events.some(e=>e.type==='session-created'));
    assert.equal(getClaudeSessionStatus('c1',dir).isProcessing,true);
    assert.ok(getClaudeSessionStatus('c1',dir).turnId);
    assert.equal((await send('duplicate')).accepted,false);
    assert.equal((await send('duplicate alias','c2',created)).accepted,false);
    assert.equal((await sendClaudeMessage({sessionId:'c99',providerSessionId:created,projectPath:path.join(dir,'other'),text:'duplicate',writer:{send:e=>events.push(e)}})).accepted,false);
    assert.equal((await abortClaudeSession('c1',dir)).aborted,true);
    await waitFor(()=>!getClaudeSessionStatus('c1',dir).isProcessing);
    assert.ok(events.some(e=>e.type==='session-aborted'));
    events.length=0;
    await send('fail');
    await waitFor(()=>events.some(e=>e.type==='claude-complete'));
    assert.ok(events.some(e=>e.type==='claude-error' && e.error==='test auth failure'));
    for (const input of ['malformed', 'silent']) {
      events.length=0; await send(input);
      await waitFor(()=>events.some(e=>e.type==='claude-complete'));
      assert.ok(events.some(e=>e.type==='claude-error'));
      assert.equal(getClaudeSessionStatus('c1',dir).isProcessing,false);
    }
    events.length=0;
    assert.equal((await send('before-init')).accepted,false);
    assert.ok(!events.some(e=>e.type==='message-accepted'));
    assert.equal((await send('invalid resume','c3','--unexpected-flag')).accepted,false);
    const calls=(await readFile(path.join(dir,'calls.jsonl'),'utf8')).trim().split('\n').map(l=>JSON.parse(l));
    assert.equal(calls.length,6);
    assert.equal(calls[0].environmentMarker,'fixture-loaded');
    assert.equal(calls[0].text,'first $(literal)');
    assert.ok(calls[1].args.includes('--resume'));
    assert.ok(calls[1].args.includes(created));
    assert.ok(calls.every(c=>!c.args.includes('--dangerously-skip-permissions') && !c.args.includes('--permission-mode')));
    await send('hold');
    await closeClaudeSessions();
    assert.equal(getClaudeSessionStatus('c1',dir).isProcessing,false);
  } finally {
    if(previousEnvFile === undefined) delete process.env.AGENTPORCH_CLAUDE_ENV_FILE;
    else process.env.AGENTPORCH_CLAUDE_ENV_FILE=previousEnvFile;
    process.env.PATH=previousPath; await rm(dir,{recursive:true,force:true}); }
});
