/** Test-only shared app-server proxy: real HTTP/WebSocket framing over stdio. */
import { createServer } from 'node:http';
import { Duplex } from 'node:stream';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { WebSocketServer } from 'ws';
const args=process.argv.slice(2);
if(args.includes('--version')) { console.log('codex-cli fixture');process.exit(0); }
if(args.includes('--help')) { console.log('codex app-server proxy --sock Unix domain socket --remote unix://');process.exit(0); }
if(args[0]!=='app-server'||args[1]!=='proxy') { process.exit(1); }
const dir=path.join(process.env.CODEX_HOME,'sessions','2026','10','16');fs.mkdirSync(dir,{recursive:true});
const threads=new Map();
const record=(thread,type,payload)=>fs.appendFileSync(thread.file,JSON.stringify({type,timestamp:new Date().toISOString(),payload})+'\n');
const socket=new Duplex({read(){},write(chunk,_encoding,done){process.stdout.write(chunk,done);}});
Object.assign(socket,{setTimeout:()=>socket,setNoDelay:()=>socket,setKeepAlive:()=>socket});
process.stdin.on('data',chunk=>socket.push(chunk));process.stdin.on('end',()=>{socket.push(null);process.exit(0);});
const http=createServer();const server=new WebSocketServer({noServer:true});
http.on('upgrade',(request,connection,head)=>server.handleUpgrade(request,connection,head,ws=>server.emit('connection',ws)));
http.emit('connection',socket);
server.on('connection',ws=>ws.on('message',raw=>{
  const {id,method,params:p={}}=JSON.parse(String(raw));if(id===undefined)return;
  const respond=result=>ws.send(JSON.stringify({id,result}));
  const notify=(method,params)=>ws.send(JSON.stringify({method,params}));
  if(method==='initialize') return respond({userAgent:'fixture'});
  if(method==='thread/start') {
    const threadId=randomUUID();const thread={id:threadId,cwd:p.cwd,file:path.join(dir,`rollout-fixture-${threadId}.jsonl`)};threads.set(threadId,thread);
    record(thread,'session_meta',{id:threadId,cwd:p.cwd,model:'codex-fixture'});return respond({thread:{id:threadId}});
  }
  if(method==='thread/resume') return respond({thread:{id:p.threadId}});
  if(method==='thread/list'||method==='thread/loaded/list') return respond({data:[...threads.keys()],nextCursor:null});
  if(method==='turn/start') {
    const thread=threads.get(p.threadId);const turnId=randomUUID();const text=p.input.map(item=>item.text||'').join('');
    record(thread,'event_msg',{type:'user_message',message:text});respond({turn:{id:turnId}});
    notify('turn/started',{threadId:p.threadId,turn:{id:turnId}});
    setTimeout(()=>{
      const reply=`fake codex response: ${text}`;const itemId=randomUUID();
      notify('item/agentMessage/delta',{threadId:p.threadId,turnId,itemId,delta:reply});
      record(thread,'response_item',{type:'message',role:'assistant',content:[{type:'output_text',text:reply}]});
      notify('item/completed',{threadId:p.threadId,turnId,item:{id:itemId,type:'agentMessage',text:reply}});
      notify('turn/completed',{threadId:p.threadId,turn:{id:turnId,status:'completed'}});
    },350);return;
  }
  respond({});
}));
