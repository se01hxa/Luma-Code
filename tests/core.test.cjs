const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { safePath, within, scanLocal, flatten, analyzeSource, buildGraph, psQuote, shQuote } = require('../electron/core.cjs');

test('workspace paths reject traversal and symlinks outside the root', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'luma-path-')); t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const root = path.join(dir, 'root'); await fs.mkdir(root); await fs.writeFile(path.join(root, 'hello.ts'), 'hello');
  assert.equal(await safePath(root, 'hello.ts'), path.join(root, 'hello.ts'));
  await assert.rejects(safePath(root, '../outside.txt'));
  await assert.rejects(safePath(root, path.join(dir, 'outside.txt')));
  await assert.rejects(safePath(root, '\0file'));
  assert.equal(await safePath(root, 'new.ts', true), path.join(root, 'new.ts'));
  const outside = path.join(dir, 'outside'); await fs.mkdir(outside); await fs.writeFile(path.join(outside, 'secret'), 'secret');
  await fs.symlink(outside, path.join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(safePath(root, 'linked/secret'));
  await assert.rejects(safePath(root, 'linked/new.ts', true));
  assert.equal(within('/project', '/project2/file', 'linux'), false);
  assert.equal(within('C:\\project', 'C:\\project2\\file', 'win32'), false);
});
test('tree scanning excludes generated folders and orders folders before files', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'luma-tree-')); t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'src')); await fs.mkdir(path.join(root, 'node_modules')); await fs.mkdir(path.join(root, '.git'));
  await fs.writeFile(path.join(root, 'src', 'app.ts'), ''); await fs.writeFile(path.join(root, 'README.md'), ''); await fs.writeFile(path.join(root, 'node_modules', 'noise.js'), '');
  const scan = await scanLocal(root);
  assert.equal(scan.tree[0].name, 'src'); assert.deepEqual(flatten(scan.tree).sort(), ['README.md', 'src/app.ts']); assert.equal(scan.truncated, false);
});
test('TypeScript AST extracts symbols and real imports without matching comments', () => {
  const result = analyzeSource('app.ts', '// import fake from "./fake"\nimport { x } from "./lib.js";\nexport interface User { name: string }\nexport const start = () => x();\nclass Client { connect() {} }\nconst lazy = import("./lazy");');
  assert.deepEqual(result.imports, ['./lib.js', './lazy']);
  assert.deepEqual(result.symbols.map(s => s.name), ['User', 'start', 'Client', 'connect']);
  assert.equal(result.symbols[0].line, 3);
});
test('dependency graph resolves TS, directory imports and Python relative modules', () => {
  const graph = buildGraph([
    { path: 'src/app.ts', content: 'import { a } from "./lib.js"; import "./components"; import "react";' },
    { path: 'src/lib.ts', content: 'export const a = 1' }, { path: 'src/components/index.tsx', content: 'export function Button() {}' },
    { path: 'pkg/main.py', content: 'from .utils import hello\n' }, { path: 'pkg/utils.py', content: 'def hello():\n    pass' },
  ]);
  assert.deepEqual(graph.edges, [{ source: 'src/app.ts', target: 'src/lib.ts' }, { source: 'src/app.ts', target: 'src/components/index.tsx' }, { source: 'pkg/main.py', target: 'pkg/utils.py' }]);
});
test('shell argument escaping preserves literal quotes, dollars and command characters', () => {
  assert.equal(psQuote("C:\\my dir\\it's $safe;file.ts"), "'C:\\my dir\\it''s $safe;file.ts'");
  assert.equal(shQuote("it's $(literal)"), "'it'\\''s $(literal)'");
});
