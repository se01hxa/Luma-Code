const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {createPrivacy,CLIENTS}=require('../electron/privacy.cjs');
const {selection,createInstaller,wingetArgs,wingetInstall,packageId,CATALOG}=require('../electron/installers.cjs');
test('post-install version comparison chooses newer toolchains and the newest installed .NET SDK',()=>{
 const {versionRank}=require('../electron/runtimes.cjs');assert.equal(versionRank('8.0.410 [C:\\dotnet]\n10.0.401 [C:\\dotnet]'),'10.0.401');assert.equal(versionRank('Python 3.14.4'),'3.14.4');assert.equal(versionRank('v26.3.0'),'26.3.0');assert.equal(versionRank('go version go1.26.2 windows/amd64'),'1.26.2');assert('3.14.4'.localeCompare('3.9.9',undefined,{numeric:true})>0);
});
test('latest stable package discovery follows nested major/minor package IDs and skips previews',async()=>{
 const base='https://api.github.com/repos/microsoft/winget-pkgs/contents/manifests/p/Python/Python';const tree={[base]:['3','2'],[base+'/3']:['16','15','14'],[base+'/3/16']:['3.16.0a1'],[base+'/3/15']:['3.15.0','3.15.1']};const found=await packageId({family:'Python.Python'},async url=>tree[url].map(name=>({name,type:'dir'})));assert.equal(found,'Python.Python.3.15');
});
test('dotenv and code previews hide values without changing raw content, including multiline secrets',async()=>{
 const {maskDocument,secretSpans}=await import('../shared/secrets.mjs');const raw='DISCORD_TOKEN = "private-test-token"\nURL=https://example.com\nKEY="first\nsecond"\n';const masked=maskDocument('.env',raw);assert.equal(masked.count,3);assert.equal(masked.content,'DISCORD_TOKEN = "***"\nURL=***\nKEY="***"\n');assert(raw.includes('private-test-token'));assert.equal(maskDocument('a.ts','const TOKEN = "abc123";\nconst title = "visible";').content,'const TOKEN = "***";\nconst title = "visible";');assert.equal(secretSpans('normal.js','const ok = "hello";').length,0);
});
test('known tokens remain hidden at every terminal chunk boundary, including repeated prefix tokens',async()=>{
 const privacy=await createPrivacy(()=>({mode:'always'}),()=>{});for(const token of ['testing-token-abcd','aaaa','abcabc']){privacy.observe('.env','TOKEN="'+token+'"');for(let cut=1;cut<token.length;cut++){const stream=privacy.stream(),left=stream.push('value:'+token.slice(0,cut)),right=stream.push(token.slice(cut)+'\n',true);assert.equal(left+right,'value:***\n');}}privacy.stop();
});
test('Discord variants enable conservative auto protection; failed detection stays protected',async()=>{
 let mode='auto',names=['DiscordCanary'];const privacy=await createPrivacy(()=>({mode}),()=>{},async()=>names);await privacy.poll();assert(privacy.status().active);names=[];await privacy.poll();assert(!privacy.status().active);names=null;await privacy.poll();assert(privacy.status().active);mode='off';privacy.update();assert(!privacy.status().active);for(const name of ['Discord','DiscordPTB','Vesktop','Legcord','ArmCord'])assert(CLIENTS.test(name));assert(!CLIENTS.test('notdiscord'));privacy.stop();
});
test('language installation validates IDs and installs shared dependencies only once',()=>{assert.deepEqual(selection(['kotlin','java','cpp','c']),['java','kotlin','c']);assert.throws(()=>selection(['python; malicious']),/언어/);assert.throws(()=>wingetArgs('A & B'),/ID/);assert(!wingetArgs('OpenJS.NodeJS').some(a=>a.includes('ignore-security')));});
test('WinGet latest-version command handles already-current packages and installer failures',async()=>{
 const calls=[],provider={packageId:async()=> 'OpenJS.NodeJS',wingetPath:async()=> 'test.exe',run:async(exe,args)=>{calls.push(args);return -1978335189;}}; // 0x8a15002b
 const result=await wingetInstall(CATALOG.find(d=>d.id==='node'),()=>{},provider);assert(result.upToDate);assert(calls[0].includes('--exact'));assert(!calls[0].includes('--no-upgrade'));provider.run=async()=>17;await assert.rejects(wingetInstall(CATALOG[1],()=>{},provider),/설치 실패/);
});
test('installation queue persists partial failure and blocks dependent installation',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'luma-install-test-'));try{const manager=createInstaller({reportPath:path.join(dir,'result.json'),provider:{packageId:async d=>d.id,wingetPath:async()=> 'test.exe',run:async(_exe,args)=>args[args.indexOf('--id')+1]==='java'?5:0,portableInstall:async()=>{throw Error('Kotlin must not run');}}});const result=await manager.start(['kotlin','node']);assert.equal(result.items.find(i=>i.id==='java').status,'error');assert.equal(result.items.find(i=>i.id==='kotlin').status,'error');assert.equal(result.items.find(i=>i.id==='node').status,'done');assert.equal(JSON.parse(await fs.readFile(path.join(dir,'result.json'),'utf8')).running,false);}finally{await fs.rm(dir,{recursive:true,force:true});}
});
