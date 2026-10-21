const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { CATALOG, detect, expand, mergeEnv, customDefinition, execute, systemPS } = require('../electron/runtimes.cjs');
const { powershellCommand } = require('../electron/runners.cjs');
test('runtime paths expand home and environment variables without evaluating commands', () => {
  assert.equal(expand('%SDK_ROOT%/bin', { SDK_ROOT: os.tmpdir() }), path.join(os.tmpdir(), 'bin'));
  assert.equal(expand('~/sdk'), path.join(os.homedir(), 'sdk'));
  assert.throws(() => expand('node --version'), /전체 경로/);
  assert.throws(() => expand('C:\\test\nfile'), /올바른/);
  assert.deepEqual(mergeEnv({ PATH: 'old' }, { Path: 'new' }), { Path: 'new' });
});
test('custom runners require safe structured arguments and a file placeholder', () => {
  const def = customDefinition({ name: 'Example', extensions: '.abc, xyz', args: '["run", "{file}"]' });
  assert.deepEqual(def.extensions, ['abc', 'xyz']);
  assert.throws(() => customDefinition({ name: 'Example', extensions: 'abc', args: '["run"]' }), /file/);
  assert.throws(() => customDefinition({ name: 'Example', extensions: '../bad' }), /확장자/);
  assert.throws(() => customDefinition({ name: 'Example', extensions: 'abc', args: '[3]' }), /문자열/);
});
test('manual validation checks executable identity, missing paths and directories', async () => {
  const node = CATALOG.find(d => d.id === 'node'), python = CATALOG.find(d => d.id === 'python');
  const found = await detect(node, process.env, undefined, process.execPath); assert.equal(found.valid, true);
  await assert.rejects(detect(python, process.env, undefined, process.execPath), /Python 실행기/);
  await assert.rejects(detect(node, process.env, undefined, path.join(os.tmpdir(), 'no-such-luma-runner')), /존재하지/);
  const folder = await detect(node, process.env, undefined, path.dirname(process.execPath)); assert.equal(folder.valid, true);
});
test('Windows batch probes and execution quote spaces, apostrophes and ampersands', { skip: process.platform !== 'win32' }, async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "Luma O'Brien & space-"));
  try {
    const batch = path.join(dir, 'node.cmd');
    await fs.writeFile(batch, `@echo off\r\n"${process.execPath}" %*\r\n`);
    const found = await detect(CATALOG.find(d => d.id === 'node'), process.env, undefined, dir); assert.equal(found.path, batch);
    const text = "literal O'Brien & space; $(echo unsafe)", command = powershellCommand([{ exe: process.execPath, args: ['-e', 'console.log(process.argv[1])', text] }]);
    const result = await execute(systemPS(), ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(command, 'utf16le').toString('base64')], process.env);
    assert.equal(result.code, 0); assert.equal(result.output, text);
    const failure = powershellCommand([{ exe: process.execPath, args: ['-e', 'process.exit(7)'] }, { exe: process.execPath, args: ['-e', 'console.log("MUST_NOT_RUN")'] }]);
    const stopped = await execute(systemPS(), ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(failure, 'utf16le').toString('base64')], process.env);
    assert.equal(stopped.code, 7); assert(!stopped.output.includes('MUST_NOT_RUN'));
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
