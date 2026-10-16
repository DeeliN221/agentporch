/** Test-only Claude CLI protocol and durable history fixture. Never calls a model. */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
const args = process.argv.slice(2);
if (args.includes('--version')) { console.log('Claude Code test fixture'); process.exit(0); }
const id = args[args.indexOf(args.includes('--resume') ? '--resume' : '--session-id') + 1];
const cwd = process.cwd();
const dir = path.join(process.env.HOME, '.claude', 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-'));
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `${id}.jsonl`);
let text = '';
let parentUuid = null;
const record = (type, content) => {
  const uuid = randomUUID();
  const message = { role: type, content, ...(type === 'assistant' ? { model: 'claude-fixture', usage: {input_tokens: 10, output_tokens: 10} } : {}) };
  fs.appendFileSync(file, JSON.stringify({ type, uuid, parentUuid, sessionId: id, cwd, timestamp: new Date().toISOString(), message }) + '\n');
  parentUuid = uuid;
  return message;
};
const send = event => console.log(JSON.stringify(event));
process.stdin.on('data', chunk => text += chunk);
process.stdin.on('end', () => {
  if (text === 'Reject before initialization') { console.error('Fixture initialization failed'); process.exitCode=1; return; }
  record('user', text);
  send({ type: 'system', subtype: 'init', session_id: id });
  if(text.includes('Hold this request')) { setInterval(()=>{},1000); return; }
  const reply = args.includes('--resume') ? 'Resumed Claude conversation.' : 'Claude reviewed the attached notes.';
  setTimeout(() => {
    send({ type: 'stream_event', event: { type: 'content_block_delta', delta: { text: reply } } });
    send({ type: 'stream_event', event: { type: 'content_block_stop' } });
    send({ type: 'assistant', message: record('assistant', [{type:'text',text:reply}]) });
    send({ type: 'assistant', message: record('assistant', [{type:'tool_use',id:'read-notes',name:'Read',input:{file_path:'review-notes.txt'}}]) });
    send({ type: 'user', message: record('user', [{type:'tool_result',tool_use_id:'read-notes',content:'Review notes loaded.'}]) });
    send({ type: 'result', subtype: 'success', session_id: id });
  }, 350);
});
