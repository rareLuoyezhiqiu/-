import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { createApp } from './app.ts';
import { events } from '../shared/sse.ts';
const origin = 'http://localhost:4173';
async function listen(server: Server) { await new Promise<void>(r => server.listen(0,'127.0.0.1',r)); return `http://127.0.0.1:${(server.address() as {port:number}).port}`; }
async function close(server: Server) { server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); }
async function fixture(mode = 'ok', options = {}) {
  const seen: any[] = []; let aborted = false;
  const upstream = createServer(async (req,res) => {
    let raw = ''; for await (const chunk of req) raw += chunk; seen.push(JSON.parse(raw));
    res.on('close',()=>{aborted=true;});
    if (mode === '429') { res.writeHead(429); res.end('secret upstream error'); return; }
    res.writeHead(200,{'Content-Type':'text/event-stream'}); res.flushHeaders();
    if (mode === 'slow') return;
    if (mode === 'anthropic') { res.end('event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"可以考虑走一段路。"}}\n\nevent: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}\n\nevent: message_stop\ndata: {"type":"message_stop"}\n\n'); return; }
    const text = mode === 'empty' ? '  ' : mode === 'huge' ? '长'.repeat(6000) : '可以考虑每天走一段路。';
    res.write(`data: ${JSON.stringify({choices:[{delta:{content:text}}]})}\n\n`);
    if (mode === 'partial') { res.end(); return; }
    res.end(`data: ${JSON.stringify({choices:[{delta:{},finish_reason:mode === 'length' ? 'length' : 'stop'}]})}\n\ndata: [DONE]\n\n`);
  });
  const endpoint = await listen(upstream);
  const config = {provider:'测试服务',endpoint,model:'test-model',protocol:mode === 'anthropic' ? 'anthropic' : 'openai',policyUrl:'https://example.com/privacy',apiKey:'SECRET'};
  const app = createApp({token:'personal-token',origin,config,allowedHosts:['127.0.0.1'],allowTestHttp:true,...options});
  const url = await listen(app);
  const headers = {Origin:origin,Authorization:'Bearer personal-token','Content-Type':'application/json'};
  const info = await (await fetch(`${url}/api/config`,{headers})).json();
  const post = (data: unknown = {content:'散步',requestId:'request-1'}, extra = {}) => fetch(`${url}/api/expand`,{method:'POST',headers:{...headers,'X-AI-Revision':info.revision,...extra},body:JSON.stringify(data)});
  return {url,headers,post,seen,info,aborted:()=>aborted,cleanup:async()=>{await close(app);await close(upstream);}};
}
test('SSE 跨 UTF-8 字节、CRLF、事件跨块与多事件同块',async()=>{
  const bytes = new TextEncoder().encode('event: delta\r\ndata: {"text":"中文"}\r\n\r\nevent: done\ndata: {}\n\n');
  const stream = new ReadableStream<Uint8Array>({start(c){ for(const b of bytes)c.enqueue(Uint8Array.of(b));c.close(); }});
  const result=[];for await(const e of events(stream))result.push(e);
  assert.deepEqual(result,[{event:'delta',data:'{"text":"中文"}'},{event:'done',data:'{}'}]);
});
test('授权、来源、格式、字数、体积、告知版本在调用上游前拒绝',async()=>{
  const f=await fixture();try {
    assert.equal((await f.post(undefined,{Authorization:''})).status,401);
    assert.equal((await f.post(undefined,{Origin:'https://evil.test'})).status,403);
    assert.equal((await f.post({content:'x',requestId:'r',noteId:'private'})).status,400);
    assert.equal((await f.post({content:'😀'.repeat(4001),requestId:'r'})).status,413);
    assert.equal((await f.post({content:'x'.repeat(33000),requestId:'r'})).status,413);
    assert.equal((await f.post(undefined,{'X-AI-Revision':'old'})).status,409);
    assert.equal(f.seen.length,0); assert.equal(JSON.stringify(f.info).includes('SECRET'),false);
  } finally {await f.cleanup();}
});
for (const mode of ['ok','anthropic','partial','empty','huge','length','429']) test(`真实 HTTP 上游转换 ${mode}`,async()=>{
  const f=await fixture(mode);try {
    const response=await f.post(), text=await response.text();
    assert.equal(text.includes('event: done'),['ok','anthropic'].includes(mode));
    if (!['ok','anthropic','429'].includes(mode)) assert.match(text,/event: error/);
    if (mode==='429') assert.equal(response.status,429);
    assert.equal(text.includes('SECRET'),false);assert.equal(text.includes('secret upstream error'),false);
    assert.equal(f.seen[0].messages.at(-1).content,'散步');assert.equal(f.seen[0].tools,undefined);
  } finally {await f.cleanup();}
});
test('超时、并发拒绝与客户端取消传递至上游',async()=>{
  const f=await fixture('slow',{timeout:150});try {
    const first=f.post(); await new Promise(r=>setTimeout(r,60));
    assert.equal((await f.post()).status,429);
    const result=await first;assert.equal(result.status,200);assert.match(await result.text(),/"code":"timeout"/);
    await new Promise(r=>setTimeout(r,20));assert.equal(f.aborted(),true);
  }finally{await f.cleanup();}
  const g=await fixture('slow');try {
    const c=new AbortController();const request=fetch(`${g.url}/api/expand`,{method:'POST',headers:{...g.headers,'X-AI-Revision':g.info.revision},body:JSON.stringify({content:'散步',requestId:'r'}),signal:c.signal}).catch(()=>null);
    await new Promise(r=>setTimeout(r,60));c.abort();await request;await new Promise(r=>setTimeout(r,30));assert.equal(g.aborted(),true);
  }finally{await g.cleanup();}
});
test('频率限制、设置验证、密钥不回传和配置更新',async()=>{
  const f=await fixture('ok',{rate:1});try{
    await (await f.post()).text();assert.equal((await f.post()).status,429);
    const invalid=await fetch(`${f.url}/api/settings`,{method:'POST',headers:f.headers,body:JSON.stringify({provider:'x',endpoint:'https://localhost/internal',model:'m',protocol:'openai',policyUrl:'https://example.com',apiKey:'NEW_SECRET'})});assert.equal(invalid.status,400);
    const valid=await fetch(`${f.url}/api/settings`,{method:'POST',headers:f.headers,body:JSON.stringify({provider:'DeepSeek',endpoint:'https://api.deepseek.com/chat/completions',model:'deepseek-flash',protocol:'openai',policyUrl:'https://example.com',apiKey:'NEW_SECRET'})});assert.equal(valid.status,200);
    const cfg=await (await fetch(`${f.url}/api/config`,{headers:f.headers})).json();assert.notEqual(cfg.revision,f.info.revision);assert.equal(cfg.apiKey,undefined);
  }finally{await f.cleanup();}
});
test('未配置服务明确关闭，不影响静态应用',async()=>{
  const app=createApp({origin});const url=await listen(app);try{assert.equal((await fetch(`${url}/api/config`,{headers:{Origin:origin}})).status,503);}finally{await close(app);}
});
