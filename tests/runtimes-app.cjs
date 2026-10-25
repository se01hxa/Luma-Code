const { _electron, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const project = path.resolve(__dirname, '..'), work = path.resolve(project, '../../work'), fixture = path.join(work, "runtime fixture O'Brien & space");
let app; const checks = [], env = { ...process.env, LUMA_SKIP_ONBOARDING:'1',LUMA_TEST_USERDATA: path.join(work, 'runtime-userdata-' + Date.now()) };
async function check(name, run) { await run(); checks.push(name); console.log('PASS ' + name); }
async function launch() {
  delete env.ELECTRON_RUN_AS_NODE;
  app = await _electron.launch({ ...(process.env.LUMA_TEST_EXECUTABLE ? { executablePath: process.env.LUMA_TEST_EXECUTABLE } : {}), args: process.env.LUMA_TEST_EXECUTABLE ? [] : [project], env, timeout: 60000 });
  const page = await app.firstWindow(); await expect(page.locator('.welcome')).toBeVisible({ timeout: 30000 }); return page;
}
async function main() {
  if (process.env.LUMA_TEST_JAVA_ROOT) env.JAVA_HOME = process.env.LUMA_TEST_JAVA_ROOT;
  if (process.env.LUMA_TEST_KOTLIN_ROOT) env.KOTLIN_HOME = process.env.LUMA_TEST_KOTLIN_ROOT;
  await fs.mkdir(fixture, { recursive: true });
  await fs.writeFile(path.join(fixture, 'hello.kt'), 'fun main() { println("KOTLIN_COMPILED_OK") }\n');
  await fs.writeFile(path.join(fixture, 'hello.kts'), 'println("KOTLIN_SCRIPT_OK")\n');
  await fs.writeFile(path.join(fixture, 'Hello.java'), 'public class Hello { public static void main(String[] args) { System.out.println("JAVA_COMPILED_OK"); } }\n');
  await fs.writeFile(path.join(fixture, 'Hello.cs'), 'Console.WriteLine("CSHARP_COMPILED_OK");\n');
  await fs.writeFile(path.join(fixture, 'custom.lumatest'), 'console.log("CUSTOM_RUNNER_OK");\n');
  let page = await launch(), errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.keyboard.press('Control+,'); await page.getByRole('button', { name: '언어와 실행기', exact: true }).click();
  const row = id => page.locator(`[data-runtime="${id}"]`);
  await check('runtime settings work before opening any file and detect real executables', async () => {
    await expect(row('node')).toContainText('준비 완료', { timeout: 40000 });
    const report = await page.evaluate(() => window.luma.runtimes()); assert(report.items.length >= 30); assert(!('env' in report)); assert(report.items.find(i => i.id === 'node').path);
  });
  await check('manual directory validation saves verified paths and rejects a different language', async () => {
    await row('node').locator('.runtime-row-heading').click(); await row('node').getByLabel('JavaScript / TypeScript 경로', { exact: true }).fill(path.dirname(process.execPath));
    await row('node').getByRole('button', { name: '검사 후 저장', exact: true }).click(); await expect(row('node')).toContainText('직접 지정', { timeout: 40000 });
    const valid = (await page.evaluate(() => window.luma.runtimes())).node;
    await row('node').locator('.runtime-row-heading').click(); await row('node').getByLabel('JavaScript / TypeScript 경로', { exact: true }).fill('C:\\missing-luma-executable.exe'); await row('node').getByRole('button', { name: '검사 후 저장', exact: true }).click(); await expect(row('node').getByRole('alert')).toContainText('존재하지');
    assert.equal((await page.evaluate(() => window.luma.runtimes())).node, valid);
    const result = await page.evaluate(async node => { try { await window.luma.saveRuntime({ id: 'python', path: node }); return ''; } catch (e) { return e.message; } }, process.execPath); assert(result.includes('Python 실행기'));
  });
  await check('new scans keep the interface responsive and can restore automatic detection', async () => {
    await row('node').getByRole('button', { name: '자동 감지로 복원' }).click(); await expect(row('node')).not.toContainText('직접 지정', { timeout: 40000 });
    await page.getByRole('button', { name: '다시 자동 확인', exact: true }).click(); await page.getByLabel('언어 검색').fill('Kotlin'); await expect(page.locator('.runtime-row')).toHaveCount(1); await expect(page.getByRole('button', { name: '다시 자동 확인', exact: true })).toBeEnabled({ timeout: 40000 }); await page.getByLabel('언어 검색').fill('');
    await page.screenshot({ path: path.join(project, '../언어-실행기-설정.png') });
  });
  const selectFile = async name => { await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, path.join(fixture, name)); await page.keyboard.press('Control+o'); await expect(page.locator('.editor-tab.active')).toContainText(name); };
  const run = async (name, marker) => { await selectFile(name); await page.keyboard.press('F5'); await expect(page.locator('.terminal-host:visible')).toContainText(marker, { timeout: 90000 }); await expect(page.locator('.terminal-host:visible')).toContainText('코드 0', { timeout: 90000 }); };
  if (env.JAVA_HOME && env.KOTLIN_HOME) {
    await check('Kotlin and JDK are discovered from SDK homes', async () => { const report = await page.evaluate(() => window.luma.runtimes()); assert.equal(report.items.find(i => i.id === 'kotlin').ready, true); assert.equal(report.items.find(i => i.id === 'java').ready, true); });
    await check('real Kotlin .kt compiles and runs from a path containing spaces and shell characters', async () => run('hello.kt', 'KOTLIN_COMPILED_OK'));
    await check('real Kotlin .kts script runs', async () => run('hello.kts', 'KOTLIN_SCRIPT_OK'));
    await check('real Java source compiles and runs', async () => run('Hello.java', 'JAVA_COMPILED_OK'));
  }
  const report = await page.evaluate(() => window.luma.runtimes());
  if (report.items.find(i => i.id === 'dotnet')?.ready) await check('real C# source builds and runs with the installed SDK', async () => run('Hello.cs', 'CSHARP_COMPILED_OK'));
  await page.keyboard.press('Control+,'); await page.getByRole('button', { name: '언어와 실행기', exact: true }).click();
  await check('unlisted languages can be registered and executed with structured arguments', async () => {
    await page.getByRole('button', { name: '실행기 추가', exact: true }).click(); await page.getByLabel('사용자 언어 이름').fill('Luma test language'); await page.getByLabel('사용자 언어 확장자').fill('lumatest'); await page.getByLabel('사용자 실행 파일 경로').fill(process.execPath); await page.getByRole('button', { name: '검사 후 등록' }).click(); await expect(page.getByRole('button', { name: /Luma test language/ })).toBeVisible({ timeout: 40000 });
    await run('custom.lumatest', 'CUSTOM_RUNNER_OK');
  });
  await check('runtime preferences persist after app restart', async () => {
    await app.evaluate(({ app }) => app.exit(0)); page = await launch();
    const report = await page.evaluate(() => window.luma.runtimes()); assert(report.items.some(i => i.custom && i.name === 'Luma test language'));
    const custom = report.items.find(i => i.custom); await page.evaluate(id => window.luma.resetRuntime(id), custom.id); assert(!(await page.evaluate(() => window.luma.runtimes())).items.some(i => i.custom));
  });
  await check('compiler output never appears in the user workspace', async () => { const names = await fs.readdir(fixture); assert(!names.some(s => /\.(jar|class|exe|csproj)$/.test(s))); });
  await check('runtime settings and runners have no uncaught renderer errors', async () => assert.deepEqual(errors, []));
  await fs.writeFile(path.join(work, 'runtime-verification.json'), JSON.stringify({ checks }, null, 2)); console.log('ALL ' + checks.length + ' RUNTIME CHECKS PASSED');
}
main().catch(async e => { console.error(e); if (app) { const page = await app.firstWindow().catch(() => null); if (page) { console.log('TOAST', await page.locator('.toast').allTextContents()); console.log('TERMINAL', await page.locator('.terminal-host:visible .xterm-rows').allTextContents()); await page.screenshot({ path: path.join(work, 'runtime-failure.png') }).catch(() => {}); } } process.exitCode = 1; }).finally(async () => { if (app) await app.evaluate(({ app }) => app.exit(0)).catch(() => {}); });
