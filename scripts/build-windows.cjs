const fs=require('node:fs/promises'),path=require('node:path'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const arg=name=>process.argv.includes(name)?process.argv[process.argv.indexOf(name)+1]:null;
const output=path.resolve(root,arg('--output')||'../../work/release-1.8');
const run=(command,args)=>new Promise((resolve,reject)=>{const child=spawn(command,args,{cwd:root,stdio:'inherit',windowsHide:true,shell:false});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error(command+' exited with '+code)));});
(async()=>{
 const pkg=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
 let compiler=arg('--compiler')||process.env.INNO_SETUP_ISCC;
 if(!compiler)for(const base of [process.env['ProgramFiles(x86)'],process.env.ProgramFiles])for(const version of [7]){const f=path.join(base||'','Inno Setup '+version,'ISCC.exe');if(await fs.stat(f).catch(()=>null))compiler=f;}
 if(!compiler)throw Error('Inno Setup 7.1.1 이상을 설치하고 INNO_SETUP_ISCC에 ISCC.exe 경로를 지정해주세요.');
 await fs.mkdir(output,{recursive:true});
 const catalogue=JSON.parse(await fs.readFile(path.join(root,'electron/install-catalog.json'),'utf8')).filter(d=>d.id!=='javac'&&(d.package||d.family||d.release||d.alias));
 const quote=s=>s.replaceAll("'","''");
 const include=path.join(output,'languages.iss');await fs.writeFile(include,'\uFEFF'+catalogue.map(d=>`LangIds.Add('${quote(d.id)}'); LangPage.Add('${quote(d.name)}');`).join('\n'),'utf8');
 if(!process.argv.includes('--skip-bundle'))await run(process.execPath,[path.join(root,'node_modules/electron-builder/cli.js'),'--win','dir','--publish','never','--config.directories.output='+output]);
 const args=['/DPublishDir='+(arg('--payload')?path.resolve(root,arg('--payload')):path.join(output,'win-unpacked')),'/DAppVersion='+pkg.version,'/DOutputDirectory='+output,'/DLanguageInclude='+include];
 if(process.argv.includes('--test-installer'))args.push('/DTestBuild=1');
 args.push(path.join(root,'build/Vexel.iss'));await run(compiler,args);
 console.log('Installer: '+path.join(output,'Vexel-Setup-'+pkg.version+'.exe'));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
