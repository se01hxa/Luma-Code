const fs=require('node:fs/promises'),fss=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const {pipeline}=require('node:stream/promises');
const {Readable}=require('node:stream');
const {execute,systemPS,envGet}=require('./runtimes.cjs');
const {psQuote}=require('./core.cjs');
const CATALOG=require('./install-catalog.json');
const sdkRoot=()=>path.join(process.env.LOCALAPPDATA||path.join(os.homedir(),'AppData/Local'),'LumaCode','sdks');
const installable=d=>!!(d.package||d.family||d.release||d.alias);
function selection(ids){if(!Array.isArray(ids)||ids.length>30||ids.some(id=>typeof id!=='string'||!CATALOG.some(d=>d.id===id&&installable(d))))throw Error('지원하는 언어를 선택해주세요.');const result=[];const add=id=>{const def=CATALOG.find(d=>d.id===id);if(def.alias)return add(def.alias);for(const dep of def.needs||[])add(dep);if(!result.includes(id))result.push(id);};ids.forEach(add);return result;}
async function json(url){const r=await fetch(url,{headers:{'User-Agent':'Luma-Code','Accept':'application/vnd.github+json'},signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error(`설치 정보 확인 실패 (${r.status}). 인터넷 연결과 GitHub 접근을 확인해주세요.`);return r.json();}
const compare=(a,b)=>a.localeCompare(b,undefined,{numeric:true});
async function packageId(def,lookup=json){
 if(def.package)return def.package;
 const base='https://api.github.com/repos/microsoft/winget-pkgs/contents/manifests/'+def.family[0].toLowerCase()+'/'+def.family.replaceAll('.','/');
 // WinGet major/minor package IDs change over time. Choose the newest family with a stable release.
 const visit=async(parts=[],depth=0)=>{
  const url=base+(parts.length?'/'+parts.join('/'):'')+(def.suffix&&parts.length?'/'+def.suffix:'');
  const entries=await lookup(url);
  if(parts.length&&entries.some(e=>e.type==='dir'&&/^\d+(?:\.\d+){2,3}(?:-\d+)?$/.test(e.name)))return def.family+'.'+parts.join('.')+(def.suffix?'.'+def.suffix:'');
  if(depth>=3||def.suffix&&parts.length)return null;
  const branches=entries.filter(e=>e.type==='dir'&&/^\d+(?:\.\d+)?$/.test(e.name)).sort((a,b)=>compare(b.name,a.name));
  for(const branch of branches.slice(0,6)){const found=await visit([...parts,branch.name],depth+1);if(found)return found;}
  return null;
 };
 const found=await visit();if(found)return found;
 throw Error('최신 안정 버전의 패키지를 확인하지 못했습니다. 공식 설치 페이지를 이용해주세요.');
}
async function wingetPath(){const dirs=(process.env.PATH||process.env.Path||'').split(path.delimiter);dirs.push(path.join(process.env.LOCALAPPDATA||'','Microsoft/WindowsApps'));for(const dir of dirs){const full=path.join(dir,'winget.exe');const r=await execute(full,['--version'],process.env,4000);if(r.code===0&&/^v?\d+\./.test(r.output))return full;}throw Error('Windows 앱 설치 관리자(WinGet)가 필요합니다. 앱 설치 관리자 설치 후 다시 시도해주세요.');}
function wingetArgs(id){if(!/^[A-Za-z0-9._+-]+$/.test(id))throw Error('올바르지 않은 패키지 ID입니다.');return ['install','--id',id,'--exact','--source','winget','--silent','--accept-source-agreements','--accept-package-agreements','--disable-interactivity'];}
async function wingetInstall(def,onLog,provider={}){
 const exe=await (provider.wingetPath||wingetPath)();
 let id;
 if(provider.packageId)id=await provider.packageId(def);
 else if(def.package)id=def.package;
 else {
   const found=await execute(exe,['search','--id',def.family,'--source','winget','--accept-source-agreements','--disable-interactivity'],process.env,60000);
   const escaped=def.family.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),suffix=def.suffix?'\\.'+def.suffix:'';
   const regex=new RegExp(escaped+'\\.(\\d+(?:\\.\\d+)*)'+suffix+'\\s+(\\S+)','g');
   const matches=[...found.output.matchAll(regex)].filter(m=>/^\d+(?:\.\d+){1,3}(?:-\d+)?$/.test(m[2])).sort((a,b)=>compare(b[1],a[1]));
   id=matches.length?def.family+'.'+matches[0][1]+(def.suffix?'.'+def.suffix:''):await packageId(def);
 }
 onLog(`WinGet · ${id} · 최신 안정 버전 설치 또는 업데이트`);
 const result=await (provider.run||run)(exe,wingetArgs(id),onLog);
 // WinGet reports "no applicable update" as a distinct nonzero HRESULT.
 if(result!==0&&(result>>>0)!==0x8a15002b)throw Error(`설치 실패 (WinGet ${'0x'+(result>>>0).toString(16)}). 설치 기록을 확인해주세요.`);
 return {package:id,upToDate:(result>>>0)===0x8a15002b};
}
function run(exe,args,onLog){return new Promise((resolve,reject)=>{const child=spawn(exe,args,{windowsHide:true,stdio:['ignore','pipe','pipe'],env:process.env});let size=0;const read=buf=>{const text=buf.toString().replace(/\x1b\[[0-?]*[ -/]*[@-~]/g,'').replace(/[\b\r]/g,'');size+=text.length;if(size<150000)onLog(text);};child.stdout.on('data',read);child.stderr.on('data',read);child.on('error',reject);const timer=setTimeout(()=>{child.kill();reject(Error('설치 제한 시간(30분)을 초과했습니다. Windows 설치가 진행 중이면 완료 후 다시 확인해주세요.'));},30*60*1000);child.on('close',code=>{clearTimeout(timer);resolve(code??-1);});});}
async function portableInstall(def,onLog,provider={}){
 const release=await (provider.json||json)('https://api.github.com/repos/'+def.release+'/releases/latest');
 if(release.prerelease||release.draft)throw Error('안정 버전이 아닙니다.');
 const asset=release.assets.find(a=>new RegExp(def.asset).test(a.name)),version=String(release.tag_name).replace(/^v/,'');
 if(!asset||!/^\d+(?:\.\d+){1,3}$/.test(version)||!/^https:\/\/github\.com\//.test(asset.browser_download_url))throw Error('공식 배포 파일을 확인하지 못했습니다.');
 let hash=asset.digest?.replace(/^sha256:/,'');
 if(!/^[a-f0-9]{64}$/i.test(hash||'')){const companion=release.assets.find(a=>a.name===asset.name+'.sha256');if(companion){const r=await fetch(companion.browser_download_url,{signal:AbortSignal.timeout(20000)});hash=(await r.text()).match(/\b[a-f0-9]{64}\b/i)?.[0];}}
 if(!/^[a-f0-9]{64}$/i.test(hash||''))throw Error('공식 SHA-256 검증 정보를 찾지 못해 다운로드를 중단했습니다.');
 const root=(provider.sdkRoot||sdkRoot)(),dir=path.join(root,def.id,version),target=path.join(dir,def.folder);
 if((await fs.stat(target).catch(()=>null))?.isFile())return {path:target,version,upToDate:true};
 await fs.mkdir(path.dirname(dir),{recursive:true});const stage=await fs.mkdtemp(path.join(path.dirname(dir),'.download-')),archive=path.join(stage,'sdk.zip'),extract=path.join(stage,'extracted');
 try{
  onLog(`${def.name} ${version} · 공식 파일 다운로드 및 SHA-256 확인`);
  const response=await fetch(asset.browser_download_url,{signal:AbortSignal.timeout(10*60*1000)});if(!response.ok||Number(response.headers.get('content-length')||0)>600*1024*1024)throw Error('다운로드에 실패했거나 파일이 너무 큽니다.');
  await pipeline(Readable.fromWeb(response.body),fss.createWriteStream(archive));
  const digest=crypto.createHash('sha256');for await(const chunk of fss.createReadStream(archive))digest.update(chunk);if(digest.digest('hex').toLowerCase()!==hash.toLowerCase())throw Error('다운로드 파일의 SHA-256이 일치하지 않습니다.');
  await fs.mkdir(extract);
  const script=`Add-Type -AssemblyName System.IO.Compression.FileSystem; $a=[IO.Compression.ZipFile]::OpenRead(${psQuote(archive)}); try { foreach($e in $a.Entries){ $p=[IO.Path]::GetFullPath([IO.Path]::Combine(${psQuote(extract)},$e.FullName)); if(-not $p.StartsWith(${psQuote(extract+path.sep)},[StringComparison]::OrdinalIgnoreCase)){throw 'Invalid archive path'} } } finally {$a.Dispose()}; [IO.Compression.ZipFile]::ExtractToDirectory(${psQuote(archive)},${psQuote(extract)})`;
  const expanded=await execute(systemPS(),['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],process.env,120000);if(expanded.code!==0)throw Error('압축 해제에 실패했습니다. '+expanded.output.slice(-500));
  if(!(await fs.stat(path.join(extract,def.folder)).catch(()=>null))?.isFile())throw Error('공식 실행 파일이 포함되지 않은 압축입니다.');
  // Preserve older versions and any running SDK. Publish only after the complete archive was verified.
  if(await fs.stat(dir).catch(()=>null))throw Error('같은 버전의 불완전한 SDK 폴더가 있습니다. 공식 설치 페이지에서 설치하거나 해당 폴더를 확인해주세요.');
  await fs.rename(extract,dir);return {path:target,version};
 }finally{await fs.rm(stage,{recursive:true,force:true,maxRetries:4,retryDelay:300});}
}
function createInstaller({onChange=()=>{},onComplete=async()=>{},reportPath,provider={},initialState}={}){
 let state=initialState&&Array.isArray(initialState.items)&&Array.isArray(initialState.logs)?{...initialState,running:false}: {running:false,items:[],logs:[],finishedAt:null};
 const notify=()=>onChange(structuredClone(state)),log=text=>{state.logs.push(String(text).slice(-6000));state.logs=state.logs.slice(-100);notify();};
 const start=async ids=>{if(state.running)throw Error('다른 언어 설치가 진행 중입니다.');const selected=selection(ids);if(!selected.length)throw Error('설치할 언어를 선택해주세요.');state={running:true,items:selected.map(id=>({id,name:CATALOG.find(d=>d.id===id).name,status:'queued'})),logs:[],finishedAt:null};notify();
  try{for(const item of state.items){const def=CATALOG.find(d=>d.id===item.id);if((def.needs||[]).some(id=>state.items.find(i=>i.id===id)?.status==='error')){item.status='error';item.error='필수 실행기 설치가 실패했습니다.';notify();continue;}item.status='installing';notify();try{const result=def.release?await (provider.portableInstall||portableInstall)(def,log):await wingetInstall(def,log,provider);Object.assign(item,{status:'done',...result});}catch(e){item.status='error';item.error=e.message;log(e.message);}notify();}
  await onComplete(state.items);
  }catch(e){log(e.message);}finally{state.running=false;state.finishedAt=new Date().toISOString();notify();if(reportPath){await fs.mkdir(path.dirname(reportPath),{recursive:true});await fs.writeFile(reportPath,JSON.stringify(state,null,2));}}
  return structuredClone(state);
 };
 return {status:()=>structuredClone(state),start,catalog:()=>CATALOG.map(d=>({...d,installable:installable(d)}))};
}
module.exports={CATALOG,selection,createInstaller,wingetArgs,wingetInstall,portableInstall,packageId,sdkRoot};
