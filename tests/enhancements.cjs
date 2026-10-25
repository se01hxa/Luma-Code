const { _electron, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const project=path.resolve(__dirname,'..'), work=path.resolve(project,'../../work'), fixture=path.join(work,'effects-fixture');
let app;const checks=[];
async function check(name,run){await run();checks.push(name);console.log('PASS '+name);}
async function main(){
  await fs.mkdir(fixture,{recursive:true});
  const original='// A real file, never replaced by animation frames.\nexport interface Workspace {\n  name: string;\n  ready: boolean;\n}\n\nexport function welcome(name: string): string {\n  return `Hello, ${name}!`;\n}\n\nconst workspace: Workspace = {\n  name: "Vexel",\n  ready: true,\n};\n\nconsole.log(welcome(workspace.name));\n';
  for(const name of ['alpha.ts','beta.ts','gamma.ts','delta.ts'])await fs.writeFile(path.join(fixture,name),name==='gamma.ts'?'console.log("SINGLE_FILE_RUN_OK");\n':original);
  await fs.writeFile(path.join(fixture,'never-opened.txt'),'Not selected.');
  const env={...process.env,LUMA_SKIP_ONBOARDING:'1',LUMA_TEST_USERDATA:path.join(work,'effects-userdata-'+Date.now())};delete env.ELECTRON_RUN_AS_NODE;
  app=await _electron.launch({...(process.env.LUMA_TEST_EXECUTABLE?{executablePath:process.env.LUMA_TEST_EXECUTABLE}:{}),args:process.env.LUMA_TEST_EXECUTABLE?[]:[project],env,timeout:60000});
  const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log(e.stack);});
  await expect(page.locator('.welcome')).toBeVisible({timeout:30000});
  await page.evaluate(()=>{window.__audio=[];const start=AudioBufferSourceNode.prototype.start;AudioBufferSourceNode.prototype.start=function(...args){const b=this.buffer;if(b){const data=b.getChannelData(0);let peak=0;for(const v of data)peak=Math.max(peak,Math.abs(v));window.__audio.push({duration:b.duration,peak});}return start.apply(this,args);};});
  const choose=async(name,cancel=false)=>{await app.evaluate(({dialog},arg)=>{dialog.showOpenDialog=async()=>({canceled:arg.cancel,filePaths:arg.cancel?[]:[arg.file]});}, {file:path.isAbsolute(name)?name:path.join(fixture,name),cancel});await page.keyboard.press('Control+o');};
  await check('Ctrl+O opens an individual file without enumerating its directory',async()=>{
    await choose('alpha.ts');await expect(page.locator('.editor-tab.active')).toContainText('alpha.ts');await expect(page.locator('.workspace-title b')).toContainText('열린 파일');await expect(page.locator('.file-tree .tree-row')).toHaveCount(1);
    assert.equal((await page.evaluate(()=>window.luma.refresh())).filesOnly,true);
  });
  await check('code reveal renders progressively and never dirties or truncates the file',async()=>{
    await expect(page.locator('.monaco-host')).toHaveAttribute('data-revealing','true');
    await expect(page.locator('.code-reveal-hidden').first()).toBeAttached();
    await page.screenshot({path:path.join(work,'code-reveal.png')});
    assert.equal(await fs.readFile(path.join(fixture,'alpha.ts'),'utf8'),original);
    assert.equal(await page.locator('.editor-tab.active .dirty-dot').count(),0);
    await page.keyboard.press('Control+s');await expect(page.locator('.monaco-host')).not.toHaveAttribute('data-revealing','true');
    assert.equal(await fs.readFile(path.join(fixture,'alpha.ts'),'utf8'),original);
  });
  await check('another selected file retains existing tabs and reveals only once',async()=>{
    await choose('beta.ts');await expect(page.locator('.editor-tab.active')).toContainText('beta.ts');await expect(page.locator('.editor-tab')).toHaveCount(2);await expect(page.locator('.file-tree .tree-row')).toHaveCount(2);
    await expect(page.locator('.monaco-host')).toHaveAttribute('data-revealing','true');await page.getByRole('tab',{name:'alpha.ts',exact:true}).click();await expect(page.locator('.monaco-host')).not.toHaveAttribute('data-revealing','true');
  });
  await check('editing immediately cancels the effect and saves complete source text',async()=>{
    await page.locator('.monaco-editor textarea').first().focus();await page.keyboard.press('Control+End');await page.keyboard.type('// edited normally');await page.keyboard.press('Control+s');
    await expect.poll(()=>fs.readFile(path.join(fixture,'alpha.ts'),'utf8')).toBe(original+'// edited normally');
  });
  await check('cancelling the native file picker retains the active file',async()=>{await choose('beta.ts',true);await expect(page.locator('.editor-tab.active')).toContainText('alpha.ts');await expect(page.locator('.editor-tab')).toHaveCount(2);});
  await page.keyboard.press('Control+,');await page.getByRole('button',{name:'효과와 소리',exact:true}).click();
  await check('seven distinct original sound designs can be previewed',async()=>{
    await expect(page.locator('.sound-library > button')).toHaveCount(7);
    for(const button of await page.locator('.sound-library > button').all()){const count=await page.evaluate(()=>window.__audio.length);await button.click();await expect.poll(()=>page.evaluate(()=>window.__audio.length)).toBeGreaterThan(count);}
    const audio=await page.evaluate(()=>window.__audio);assert(audio.every(a=>a.peak>0&&a.peak<1&&a.duration>0));assert(audio.some(a=>Math.abs(a.duration-.115)<.001));assert(audio.some(a=>Math.abs(a.duration-.42)<.001));assert(audio.some(a=>Math.abs(a.duration-.32)<.001));
  });
  await check('mute disables button sounds and preferences are persisted',async()=>{
    await page.getByRole('switch',{name:'효과음 사용',exact:true}).click();await expect(page.getByRole('switch',{name:'효과음 사용',exact:true})).toHaveAttribute('aria-checked','false');
    await page.waitForTimeout(100);const count=await page.evaluate(()=>window.__audio.length);await page.getByRole('button',{name:'모양과 배경',exact:true}).click();await page.getByRole('button',{name:'효과와 소리',exact:true}).click();assert.equal(await page.evaluate(()=>window.__audio.length),count);
    await page.getByRole('switch',{name:'효과음 사용',exact:true}).click();await page.getByLabel('버튼 클릭 소리',{exact:true}).selectOption('soft');await page.getByLabel('애니메이션 시간',{exact:true}).fill('1600');
    await expect.poll(()=>page.evaluate(async()=>{const c=(await window.luma.bootstrap()).config;return [c.theme.clickSound,c.theme.animationDuration];})).toEqual(['soft',1600]);
  });
  await check('animation can be disabled for newly opened files',async()=>{
    await page.getByRole('switch',{name:'코드 열기 애니메이션',exact:true}).click();await choose('gamma.ts');await expect(page.locator('.editor-tab.active')).toContainText('gamma.ts');await expect(page.locator('.monaco-host')).not.toHaveAttribute('data-revealing','true');
  });
  await check('single-file mode executes with the installed runtime',async()=>{await page.keyboard.press('F5');await expect(page.locator('.terminal-host:visible')).toContainText('SINGLE_FILE_RUN_OK',{timeout:25000});});
  await check('operating-system reduced-motion preference skips code animation',async()=>{
    await page.keyboard.press('Control+,');await page.getByRole('button',{name:'효과와 소리',exact:true}).click();await page.getByRole('switch',{name:'코드 열기 애니메이션',exact:true}).click();await page.emulateMedia({reducedMotion:'reduce'});await choose('delta.ts');await expect(page.locator('.editor-tab.active')).toContainText('delta.ts');await expect(page.locator('.monaco-host')).not.toHaveAttribute('data-revealing','true');
  });
  await check('opening a different directory protects unsaved edits and can save before switching',async()=>{
    const dir=path.join(work,'effects-other');await fs.mkdir(dir,{recursive:true});const outside=path.join(dir,'outside.js');await fs.writeFile(outside,'console.log("outside file");\n');
    await page.locator('.monaco-editor .view-lines').click({position:{x:180,y:90}});await page.keyboard.press('Control+End');await page.keyboard.type('// SAVE_BEFORE_SWITCH');await expect(page.locator('.editor-tab.active .dirty-dot')).toBeVisible();
    await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:0,checkboxChecked:false});});await choose(outside);await expect(page.locator('.editor-tab.active')).toContainText('delta.ts');await expect(page.locator('.editor-tab.active .dirty-dot')).toBeVisible();
    await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:2,checkboxChecked:false});});await choose(outside);await expect(page.locator('.editor-tab.active')).toContainText('outside.js');assert((await fs.readFile(path.join(fixture,'delta.ts'),'utf8')).includes('SAVE_BEFORE_SWITCH'));await expect(page.locator('.file-tree .tree-row')).toHaveCount(1);
  });
  await check('no uncaught errors from animations, audio or file opening',async()=>assert.deepEqual(errors,[]));
  await fs.writeFile(path.join(work,'effects-verification.json'),JSON.stringify({checks},null,2));console.log('ALL '+checks.length+' ENHANCEMENT CHECKS PASSED');
}
main().catch(async e=>{console.error(e);if(app){const page=await app.firstWindow().catch(()=>null);if(page){console.log('TOAST',await page.locator('.toast').allTextContents());await page.screenshot({path:path.join(work,'effects-failure.png')}).catch(()=>{});}}process.exitCode=1;}).finally(async()=>{if(app)await app.evaluate(({app})=>app.exit(0)).catch(()=>{});});
