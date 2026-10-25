const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {Server}=require('@modelcontextprotocol/sdk/server/index.js');
const {StdioServerTransport}=require('@modelcontextprotocol/sdk/server/stdio.js');
const {ListToolsRequestSchema,CallToolRequestSchema,ListResourcesRequestSchema,ReadResourceRequestSchema}=require('@modelcontextprotocol/sdk/types.js');
const {TOOL_DEFS}=require('./ai-tools.cjs');
async function startBridge({descriptor,call}){
 const token=crypto.randomBytes(32).toString('hex');
 const server=http.createServer(async(req,res)=>{
  const auth=Buffer.from(req.headers.authorization||''),expected=Buffer.from('Bearer '+token);
  if(req.headers.origin||req.method!=='POST'||req.url!=='/tool'||auth.length!==expected.length||!crypto.timingSafeEqual(auth,expected)){res.writeHead(403);res.end();return;}
  try{let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>2*1024*1024)throw Error('요청이 너무 큽니다.');chunks.push(chunk);}const body=JSON.parse(Buffer.concat(chunks));if(!TOOL_DEFS.some(t=>t.name===body.name))throw Error('지원하지 않는 도구입니다.');const result=await call(body.name,body.arguments||{});res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({result}));}catch(e){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:e.message}));}
 });
 server.requestTimeout=30000;await new Promise((r,j)=>{server.once('error',j);server.listen(0,'127.0.0.1',r);});const endpoint='http://127.0.0.1:'+server.address().port+'/tool';await fs.mkdir(path.dirname(descriptor),{recursive:true});await fs.writeFile(descriptor,JSON.stringify({version:1,endpoint,token,pid:process.pid}),{mode:0o600});
 return {descriptor,port:server.address().port,stop:async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));try{const d=JSON.parse(await fs.readFile(descriptor,'utf8'));if(d.token===token)await fs.rm(descriptor,{force:true});}catch{}}};
}
async function runProxy(descriptor){
 const load=async()=>{const data=JSON.parse(await fs.readFile(descriptor,'utf8')),url=new URL(data.endpoint);if(url.hostname!=='127.0.0.1'||url.protocol!=='http:'||url.pathname!=='/tool'||url.username||url.password||!/^\d+$/.test(url.port)||!/^\w{64}$/.test(data.token))throw Error('유효한 Vexel MCP 연결 파일이 아닙니다.');return data;};await load();
 const invoke=async(name,args)=>{const data=await load();const r=await fetch(data.endpoint,{method:'POST',headers:{Authorization:'Bearer '+data.token,'Content-Type':'application/json'},body:JSON.stringify({name,arguments:args}),signal:AbortSignal.timeout(35000)});const body=await r.json();if(!r.ok||body.error)throw Error(body.error||'Vexel 연결 실패');return body.result;};
 const server=new Server({name:'luma-code',version:'1.7.0'},{capabilities:{tools:{},resources:{}}});
 server.setRequestHandler(ListToolsRequestSchema,async()=>({tools:TOOL_DEFS}));
 server.setRequestHandler(CallToolRequestSchema,async req=>{try{return {content:[{type:'text',text:JSON.stringify(await invoke(req.params.name,req.params.arguments||{}))}]};}catch(e){return {isError:true,content:[{type:'text',text:e.message}]};}});
 server.setRequestHandler(ListResourcesRequestSchema,async()=>({resources:[{uri:'luma://editor/active',name:'Luma active editor',mimeType:'application/json'}]}));
 server.setRequestHandler(ReadResourceRequestSchema,async req=>{if(req.params.uri!=='luma://editor/active')throw Error('알 수 없는 리소스입니다.');return {contents:[{uri:req.params.uri,mimeType:'application/json',text:JSON.stringify(await invoke('luma_active_editor',{}))}]};});
 await server.connect(new StdioServerTransport());return server;
}
module.exports={startBridge,runProxy};
