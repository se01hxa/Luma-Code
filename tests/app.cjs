const { _electron: electron, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const project = path.resolve(__dirname, '..');
const work = path.resolve(project, '../../work');
const fixture = path.join(work, 'app-fixture');
const checks = [];
let application, sshFixture;
async function check(name, fn) { await fn(); checks.push(name); console.log(`PASS ${name}`); }
async function main() {
  assert.equal(path.dirname(fixture), work); await fs.rm(fixture, { recursive: true, force: true });
  await fs.mkdir(path.join(fixture, 'src'), { recursive: true });
  await fs.writeFile(path.join(fixture, 'src', 'math.ts'), 'export function greet(name: string): string {\n  return `Hello, ${name}!`;\n}\n');
  await fs.writeFile(path.join(fixture, 'src', 'main.ts'), 'import { greet } from "./math";\n\nconst message: string = greet("Luma");\nconsole.log(message);\n');
  await fs.writeFile(path.join(fixture, 'hello.js'), 'console.log("LUMA_JS_OK");\n');
  await fs.writeFile(path.join(fixture, 'hello.py'), 'import json\n\nclass Project:\n    def greet(self, name: str) -> str:\n        return f"Hello, {name}"\n\nprint("LUMA_PY_OK")\n');
  await fs.writeFile(path.join(fixture, 'hello.ps1'), 'Write-Output "LUMA_PS_OK"\n');
  await fs.writeFile(path.join(fixture, 'README.md'), '# Luma workspace\n\nA real project, ready to explore.\n');
  const env = { ...process.env, LUMA_SKIP_ONBOARDING:'1',LUMA_TEST_USERDATA: path.join(work, 'test-userdata-' + Date.now()) };
  const pythonBin = process.env.LUMA_TEST_PYTHON ? path.dirname(process.env.LUMA_TEST_PYTHON) : '';
  const pathKey=Object.keys(env).find(k=>k.toLowerCase()==='path'); if (pythonBin) env[pathKey]=pythonBin + path.delimiter + env[pathKey];
  delete env.ELECTRON_RUN_AS_NODE;
  application = await electron.launch({ ...(process.env.LUMA_TEST_EXECUTABLE ? { executablePath: process.env.LUMA_TEST_EXECUTABLE } : {}), args: process.env.LUMA_TEST_EXECUTABLE ? ['--workspace', fixture] : [project, '--workspace', fixture], env, timeout: 60000 });
  const page = await application.firstWindow();
  const errors = [];
  page.on('pageerror', e => { errors.push(e.stack || e.message); console.log('PAGE ERROR', e.stack); });
  page.on('console', m => { if (m.type() === 'error') console.log('RENDERER', m.text().slice(0, 500)); });
  await application.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false }); });
  await check('desktop opens real workspace and renders folder map', async () => { await expect(page.locator('.map-header h1')).toContainText('프로젝트 구조', { timeout: 30000 }); await expect(page.locator('.map-node')).toHaveCount(8, { timeout: 30000 }); });
  await page.screenshot({ path: path.join(work, 'map-initial.png') });
  await check('dependency map resolves imported local TypeScript module', async () => { await page.getByRole('button', { name: '의존 관계', exact: true }).click(); await expect(page.locator('.react-flow__edge')).toHaveCount(1); });
  await check('file tree opens Monaco and edits are persisted with Ctrl+S', async () => {
    await page.locator('.tree-row').filter({ hasText: 'main.ts' }).click(); await expect(page.locator('.editor-tab.active')).toContainText('main.ts');
    await expect(page.locator('.editor-tab.active')).toContainText('main.ts');
    await page.locator('.monaco-editor textarea').first().focus();
    await page.keyboard.press('Control+End'); await page.keyboard.type('\n// saved by integration test');
    await expect(page.locator('.editor-tab.active .dirty-dot')).toBeVisible();
    await page.keyboard.press('Control+s');
    await expect.poll(() => fs.readFile(path.join(fixture, 'src/main.ts'), 'utf8')).toContain('saved by integration test');
  });
  await check('TypeScript IntelliSense suggests string members', async () => {
    await page.locator('.monaco-editor textarea').first().focus(); await page.keyboard.press('Control+End'); await page.keyboard.type('\nmessage.');
    await page.keyboard.type('toU'); await page.keyboard.press('Control+Space'); await expect(page.locator('.suggest-widget.visible')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('.suggest-widget')).toContainText('toUpperCase', { timeout: 20000 });
    await page.keyboard.press('Escape'); await page.keyboard.press('Control+z'); await page.keyboard.press('Control+z');
  });
  await check('project search finds real saved content', async () => { await page.getByTitle('검색 · Ctrl+Shift+F').click(); await page.getByLabel('프로젝트 검색', { exact: true }).fill('LUMA_JS_OK'); await expect(page.locator('.search-match')).toContainText('LUMA_JS_OK', { timeout: 15000 }); });
  await check('command palette and theme settings apply immediately', async () => {
    await page.keyboard.press('Control+,'); await page.getByRole('button', { name: /Deep Ocean/ }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'ocean');
    await page.getByRole('button', { name: /Midnight/ }).click();
    await page.getByRole('button', { name: '편집기 설정', exact: true }).click(); await page.getByLabel('글꼴 크기').fill('16');
    await page.keyboard.press('Control+Shift+p'); await expect(page.getByRole('dialog', { name: '명령 팔레트' })).toBeVisible(); await page.keyboard.press('Escape');
  });
  await check('custom GIF backgrounds load from disk and can be removed', async () => {
    const gif=path.join(work,'theme-test.gif'); await fs.writeFile(gif,Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7','base64'));
    await application.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({filePaths:[file],canceled:false});},gif);
    await page.getByRole('button',{name:'모양과 배경',exact:true}).click(); await page.getByRole('button',{name:/이미지 또는 GIF 선택/}).click();
    await expect(page.locator('.app-wallpaper')).toBeVisible(); assert((await page.locator('.app-wallpaper').getAttribute('style')).includes('data:image/gif'));
    await page.getByRole('button',{name:'배경 이미지 제거',exact:true}).click(); await expect(page.locator('.app-wallpaper')).toHaveCount(0);
    await page.screenshot({path:path.join(work,'settings-final.png')});
  });
  await page.getByTitle('탐색기 · Ctrl+Shift+E').click();
  await check('JavaScript runs in an actual terminal', async () => {
    await page.locator('.tree-row').filter({ hasText: 'hello.js' }).click(); await expect(page.locator('.editor-tab.active')).toContainText('hello.js'); await page.getByTitle('파일 실행 · F5').click();
    console.log('RUNTIMES', await page.evaluate(() => window.luma.runtimes()));
    await expect(page.locator('.terminal-host:visible')).toContainText('LUMA_JS_OK', { timeout: 25000 });
    await expect(page.locator('.terminal-host:visible')).toContainText('프로세스 종료 · 코드 0', { timeout: 25000 });
  });
  await check('TypeScript runs via bundled tsx', async () => {
    await page.locator('.tree-row').filter({ hasText: 'main.ts' }).click(); await expect(page.locator('.editor-tab.active')).toContainText('main.ts');
    await page.locator('.monaco-editor textarea').first().focus(); await page.keyboard.press('Control+a'); await page.keyboard.type('const message: string = "LUMA_TS_OK";\nconsole.log(message);\n');
    await page.keyboard.press('F5'); await expect(page.locator('.terminal-host:visible')).toContainText('LUMA_TS_OK', { timeout: 25000 });
  });
  await check('Python language server returns real completions', async () => {
    const uri = pathToFileURL(path.join(fixture, 'hello.py')).href;
    const items = await page.evaluate(async ({ uri }) => {
      await window.luma.pythonNotify('textDocument/didOpen', { textDocument: { uri, languageId: 'python', version: 1, text: 'import json\njson.' } });
      return window.luma.python('textDocument/completion', { textDocument: { uri }, position: { line: 1, character: 5 } });
    }, { uri });
    assert((items.items || items).some(i => i.label === 'dumps'));
  });
  await check('Python and PowerShell scripts execute with installed interpreters', async () => {
    await page.locator('.tree-row').filter({ hasText: 'hello.py' }).click(); await expect(page.locator('.editor-tab.active')).toContainText('hello.py'); await page.keyboard.press('F5'); await expect(page.locator('.terminal-host:visible')).toContainText('LUMA_PY_OK', { timeout: 25000 });
    await page.locator('.tree-row').filter({ hasText: 'hello.ps1' }).click(); await expect(page.locator('.editor-tab.active')).toContainText('hello.ps1'); await page.keyboard.press('F5'); await expect(page.locator('.terminal-host:visible')).toContainText('LUMA_PS_OK', { timeout: 25000 });
  });
  await check('interactive terminal accepts keyboard input and interrupts running commands', async () => {
    await page.getByTitle('새 터미널',{exact:true}).click(); await expect(page.locator('.terminal-host:visible')).toBeVisible();
    await page.locator('.terminal-host:visible .xterm-helper-textarea').focus(); await page.keyboard.type("Write-Output 'LUMA_INTERACTIVE_OK'"); await page.keyboard.press('Enter');
    await expect(page.locator('.terminal-host:visible .xterm-rows > div').filter({hasText:/^LUMA_INTERACTIVE_OK\s*$/})).toBeVisible({timeout:15000});
    await page.keyboard.type("Write-Output 'LUMA_SLEEP_STARTED'; Start-Sleep -Seconds 20"); await page.keyboard.press('Enter');
    await expect(page.locator('.terminal-host:visible .xterm-rows > div').filter({hasText:/^LUMA_SLEEP_STARTED\s*$/})).toBeVisible({timeout:15000});
    await page.keyboard.press('Control+c');
    await expect.poll(async()=>{const rows=await page.locator('.terminal-host:visible .xterm-rows > div').allTextContents();return rows.map(r=>r.trim()).filter(Boolean).at(-1);},{timeout:10000}).toMatch(/^PS .*?>$/);
    await page.keyboard.type("Write-Output 'LUMA_INTERRUPT_OK'"); await page.keyboard.press('Enter');
    await expect(page.locator('.terminal-host:visible .xterm-rows > div').filter({hasText:/^LUMA_INTERRUPT_OK\s*$/})).toBeVisible({timeout:15000});
  });
  await check('file creation dialog creates and opens a real file', async () => { await page.getByTitle('새 파일', { exact: true }).click(); await page.keyboard.press('Control+s'); await page.getByLabel('새 파일 언어').selectOption('ts'); await page.getByRole('button',{name:'다음',exact:true}).click(); await page.getByLabel('새 파일 이름').fill('src/new.ts'); await page.getByRole('button',{name:'저장',exact:true}).click(); await expect(page.locator('.editor-tab.active')).toContainText('new.ts'); assert.equal(await fs.readFile(path.join(fixture, 'src/new.ts'), 'utf8'), ''); });
  await check('unsaved edits and theme settings survive a renderer restart', async () => {
    await page.locator('.monaco-editor textarea').first().focus(); await page.keyboard.type('// RECOVERY_DRAFT\n');
    await expect(page.locator('.editor-tab.active .dirty-dot')).toBeVisible();
    await page.waitForFunction(()=>Object.keys(localStorage).some(k=>k.startsWith('luma:session:') && localStorage.getItem(k).includes('RECOVERY_DRAFT')));
    await page.reload(); await expect(page.locator('.editor-tab.active')).toContainText('new.ts',{timeout:30000});
    await expect(page.locator('.editor-tab.active .dirty-dot')).toBeVisible(); await expect(page.locator('.monaco-editor')).toContainText('RECOVERY_DRAFT');
    assert.equal(await page.evaluate(async()=>(await window.luma.bootstrap()).config.theme.fontSize),16);
    await page.keyboard.press('Control+s'); await expect.poll(()=>fs.readFile(path.join(fixture,'src/new.ts'),'utf8')).toContain('RECOVERY_DRAFT');
  });
  await check('stale writes are rejected to protect external changes', async () => {
    const before = await page.evaluate(() => window.luma.readFile('hello.js'));
    await new Promise(resolve => setTimeout(resolve, 50)); await fs.writeFile(path.join(fixture, 'hello.js'), '// external change');
    const error = await page.evaluate(async before => { try { await window.luma.writeFile('hello.js', '// overwrite', before.mtime, false); return ''; } catch (e) { return e.message; } }, before);
    assert(error.includes('CONFLICT')); assert.equal(await fs.readFile(path.join(fixture, 'hello.js'), 'utf8'), '// external change');
  });
  await check('workspace traversal is blocked across the IPC boundary', async () => { const blocked = await page.evaluate(async () => { try { await window.luma.readFile('../outside'); return false; } catch { return true; } }); assert(blocked); });
  await check('unsupported text encoding is rejected without altering bytes', async () => {
    const bytes=Buffer.from([0xbe,0xc8,0xb3,0xe7]); await fs.writeFile(path.join(fixture,'legacy.txt'),bytes);
    const error=await page.evaluate(async()=>{try{await window.luma.readFile('legacy.txt');return '';}catch(e){return e.message;}}); assert(error.includes('UTF-8')); assert.deepEqual(await fs.readFile(path.join(fixture,'legacy.txt')),bytes);
  });
  if(await page.getByTitle('패널 닫기',{exact:true}).isVisible()) await page.getByTitle('패널 닫기',{exact:true}).click(); await page.locator('.tree-row').filter({ hasText: 'main.ts' }).click(); await expect(page.locator('.editor-tab.active')).toContainText('main.ts'); await page.screenshot({ path: path.join(work, 'editor-final.png') });
  await check('SSH connects over a real encrypted transport and reads remote files', async () => {
    await page.locator('.monaco-editor textarea').first().focus(); await page.keyboard.press('Control+End'); await page.keyboard.type('\n// DISCARDED_DRAFT'); await expect(page.locator('.editor-tab.active .dirty-dot')).toBeVisible();
    const remoteDir=path.join(work,'ssh-fixture'); await fs.mkdir(remoteDir,{recursive:true}); await fs.writeFile(path.join(remoteDir,'remote.js'),'console.log("remote workspace");\n');
    sshFixture=await require('./ssh-fixture.cjs')(remoteDir);
    await page.locator('.activity-main button[title="SSH 원격 연결"]').click(); await page.getByRole('button',{name:'새 연결',exact:true}).click();
    await page.getByLabel('호스트',{exact:true}).fill('127.0.0.1'); await page.getByLabel('포트',{exact:true}).fill(String(sshFixture.port)); await page.getByLabel('사용자 이름',{exact:true}).fill('tester'); await page.getByLabel('원격 폴더',{exact:true}).fill('/project'); await page.getByLabel('비밀번호',{exact:true}).fill('test-only'); await page.getByRole('button',{name:'연결하기',exact:true}).click();
    await expect(page.getByRole('dialog',{name:'SSH 원격 연결'})).toBeHidden({timeout:30000}); await expect(page.locator('.remote-status')).toContainText('127.0.0.1');
    const file=await page.evaluate(()=>window.luma.readFile('remote.js')); assert(file.content.includes('remote workspace'));
    assert(!(await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('luma:session:')).map(k=>localStorage.getItem(k)).join(''))).includes('DISCARDED_DRAFT'));
  });
  await check('remote SFTP writes and SSH execution round-trip successfully', async () => {
    const before=await page.evaluate(()=>window.luma.readFile('remote.js'));
    await page.evaluate(async before=>window.luma.writeFile('remote.js','console.log("updated remote");\n',before.mtime,false),before);
    assert((await fs.readFile(path.join(work,'ssh-fixture/remote.js'),'utf8')).includes('updated remote'));
    await page.locator('.tree-row').filter({hasText:'remote.js'}).click(); await expect(page.locator('.editor-tab.active')).toContainText('remote.js'); await page.keyboard.press('F5');
    await expect(page.locator('.terminal-host:visible')).toContainText('LUMA_REMOTE_EXEC_OK',{timeout:15000}); assert(sshFixture.commands.some(s=>s.includes("node '/project/remote.js'")));
    const stored=await fs.readFile(path.join(env.LUMA_TEST_USERDATA,'settings.json'),'utf8'); assert(!stored.includes('test-only'));
    await page.locator('.activity-main button[title="SSH 원격 연결"]').click(); await page.getByRole('button',{name:'연결 종료',exact:true}).click(); await expect(page.locator('.welcome')).toBeVisible();
    await sshFixture.close(); sshFixture=undefined;
  });
  await check('no uncaught renderer errors', async () => { assert.deepEqual(errors, []); });
  await fs.writeFile(path.join(work, 'verification.json'), JSON.stringify({ date: new Date().toISOString(), checks }, null, 2));
  console.log(`ALL ${checks.length} APP CHECKS PASSED`);
}
main().catch(async e => { console.error(e); if (application) { const page = await application.firstWindow().catch(() => null); if (page) console.log('ERROR TOAST', await page.locator('.toast').allTextContents()); if (page) await page.screenshot({ path: path.join(work, 'failure.png') }).catch(() => {}); } process.exitCode = 1; }).finally(async () => { if (application) { await application.evaluate(({ app }) => app.exit(0)).catch(() => {}); } if(sshFixture) await sshFixture.close(); });


