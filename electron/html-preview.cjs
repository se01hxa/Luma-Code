const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const core=require('./core.cjs');
const MIME={'.html':'text/html; charset=utf-8','.htm':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.ico':'image/x-icon','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf','.wasm':'application/wasm','.mp4':'video/mp4','.mp3':'audio/mpeg','.txt':'text/plain; charset=utf-8'};
function createPreview({openExternal}){
 let server,root,token,origin,starting,cookieName;
 async function close(){if(server){server.closeAllConnections();await new Promise(r=>server.close(r));server=null;}root=null;}
 async function start(folder){
  if(server&&root===folder)return;
  await close();root=folder;token=crypto.randomBytes(24).toString('hex');
  server=http.createServer(async(req,res)=>{
   try{
    if(req.headers.host!==new URL(origin).host||!['GET','HEAD'].includes(req.method)||req.headers.origin&&req.headers.origin!==origin){res.writeHead(403);res.end();return;}
    const raw=req.url.split('?')[0],prefix='/'+token+'/';
    const prefixed=raw.startsWith(prefix),cookie=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='));
    if(!prefixed&&cookie!==cookieName+'='+token){res.writeHead(404);res.end();return;}
    let relative=decodeURIComponent(prefixed?raw.slice(prefix.length):raw.slice(1));
    if(relative.endsWith('/')||!relative)relative+='index.html';
    const parts=relative.split(/[\\/]/);
    if(parts.some(p=>p.startsWith('.'))||/\.(?:pem|key|pfx|p12)$/i.test(relative))throw Error('blocked');
    const full=await core.safePath(root,relative),stat=await fs.stat(full);
    if(!stat.isFile()||stat.size>32*1024*1024)throw Error('blocked');
    const data=req.method==='HEAD'?null:await fs.readFile(full);
    res.writeHead(200,{'Content-Type':MIME[path.extname(full).toLowerCase()]||'application/octet-stream','Content-Length':stat.size,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Set-Cookie':cookieName+'='+token+'; Path=/; HttpOnly; SameSite=Strict'});res.end(data);
   }catch{res.writeHead(404);res.end();}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});origin='http://127.0.0.1:'+server.address().port;cookieName='vexel_preview_'+server.address().port;
 }
 async function open(workspace,relative){
  if(workspace.remote)throw Error('HTML 미리보기는 로컬 파일을 지원합니다. 원격 파일을 로컬에 저장한 뒤 열어주세요.');
  if(!/\.html?$/i.test(relative))throw Error('HTML 파일을 선택해주세요.');
  if(workspace.filesOnly&&!workspace.files.has(relative))throw Error('파일 열기에서 선택한 HTML만 실행할 수 있습니다.');
  const full=await core.safePath(workspace.root,relative);if(!(await fs.stat(full)).isFile())throw Error('HTML 파일을 찾을 수 없습니다.');
  // Serialize server replacement; retain one origin so browser refresh shows newly saved assets.
  const prior=starting;starting=(async()=>{if(prior)await prior;await start(workspace.root);})();
  const job=starting;try{await job;}finally{if(starting===job)starting=null;}
  const url=origin+'/'+token+'/'+relative.split(/[\\/]/).map(encodeURIComponent).join('/');await openExternal(url);return {opened:true};
 }
 async function stop(){if(starting)await starting.catch(()=>{});await close();}
 return {open,stop};
}
module.exports={createPreview};
