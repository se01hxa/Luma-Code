const fs = require('node:fs/promises');
const path = require('node:path');
const ts = require('typescript');

const IGNORED = new Set(['.git', 'node_modules', '.venv', 'venv', '__pycache__', '.next', '.nuxt', 'dist', 'build', 'target', '.idea', '.cache', '.turbo']);
const SOURCE = /\.(?:[cm]?[jt]sx?|py|ps1|psm1|json|jsonc|css|scss|html|md|yaml|yml|toml|rs|go|java|kt|kts|cs|fsx|rb|php|lua|pl|r|jl|dart|swift|hs|nim|zig|ml|rkt|ex|exs|groovy|scala|sc|c|cpp|cc|cxx|h|sh|sql|xml|vue|svelte)$/i;
const CODE = /\.(?:[cm]?[jt]sx?|py|ps1|psm1|rs|go|java|kt|kts|cs|fsx|rb|php|lua|pl|r|jl|dart|swift|hs|nim|zig|ml|rkt|ex|exs|groovy|scala|sc|c|cpp|cc|cxx|h|sh|vue|svelte)$/i;
const LIMIT = 3000;
const slash = s => s.replace(/\\/g, '/');
const within = (root, target, platform = process.platform) => {
  const p = platform === 'win32' ? path.win32 : path.posix;
  const rel = p.relative(root, target);
  return !p.isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${p.sep}`);
};

async function safePath(root, relative, allowMissing = false) {
  if (typeof relative !== 'string' || relative.includes('\0') || path.isAbsolute(relative)) throw Error('올바르지 않은 파일 경로입니다.');
  const target = path.resolve(root, relative);
  if (!within(root, target)) throw Error('작업 폴더 밖의 파일에는 접근할 수 없습니다.');
  let real;
  try { real = await fs.realpath(target); }
  catch (e) {
    if (!allowMissing || e.code !== 'ENOENT') throw e;
    real = path.join(await fs.realpath(path.dirname(target)), path.basename(target));
  }
  if (!within(root, real)) throw Error('작업 폴더 밖을 가리키는 링크입니다.');
  return target;
}

async function scanLocal(root) {
  let count = 0, truncated = false;
  const visit = async (dir, rel = '', depth = 0) => {
    if (depth > 22) { truncated = true; return []; }
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const children = [];
    for (const entry of entries.sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name))) {
      if (IGNORED.has(entry.name) || entry.isSymbolicLink() || entry.name.startsWith('.luma-save-')) continue;
      if (count >= LIMIT) { truncated = true; break; }
      const name = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        count++;
        try { children.push({ name: entry.name, path: name, kind: 'directory', children: await visit(path.join(dir, entry.name), name, depth + 1) }); }
        catch { children.push({ name: entry.name, path: name, kind: 'directory', children: [], inaccessible: true }); }
      } else if (entry.isFile()) { count++; children.push({ name: entry.name, path: name, kind: 'file' }); }
    }
    return children;
  };
  return { tree: await visit(root), count, truncated };
}

function flatten(tree) {
  return tree.flatMap(n => n.kind === 'file' ? [n.path] : flatten(n.children || []));
}

function analyzeSource(file, content) {
  const symbols = [], imports = [];
  if (/\.[cm]?[jt]sx?$/i.test(file)) {
    const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
    const add = (node, kind) => {
      const name = node.name?.getText(source);
      if (name) symbols.push({ name, kind, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1 });
    };
    const visit = node => {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) imports.push(node.moduleSpecifier.text);
      }
      if (ts.isCallExpression(node) && (node.expression.getText(source) === 'require' || node.expression.kind === ts.SyntaxKind.ImportKeyword)) {
        if (node.arguments[0] && ts.isStringLiteral(node.arguments[0])) imports.push(node.arguments[0].text);
      }
      if (ts.isFunctionDeclaration(node)) add(node, 'function');
      if (ts.isClassDeclaration(node)) add(node, 'class');
      if (ts.isInterfaceDeclaration(node)) add(node, 'interface');
      if (ts.isTypeAliasDeclaration(node)) add(node, 'type');
      if (ts.isEnumDeclaration(node)) add(node, 'enum');
      if (ts.isMethodDeclaration(node)) add(node, 'method');
      if (ts.isVariableDeclaration(node) && node.initializer && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) add(node, 'function');
      ts.forEachChild(node, visit);
    };
    visit(source);
  } else {
    content.split(/\r?\n/).forEach((line, index) => {
      const m = /^(\s*)(?:(?:async\s+)?def\s+([\w]+)|class\s+([\w]+)|function\s+([\w-]+)|(?:export\s+)?(?:pub\s+)?(?:fn|func)\s+([\w]+))/.exec(line);
      if (m) symbols.push({ name: m[2] || m[3] || m[4] || m[5], kind: m[3] ? 'class' : 'function', line: index + 1 });
      const py = /^\s*from\s+([\w.]+)\s+import|^\s*import\s+([\w.]+)/.exec(line);
      if (py) imports.push(py[1] || py[2]);
      const ps = /^\s*(?:Import-Module|\.\s+)\s*['"]?([^'"\s;]+)/i.exec(line);
      if (ps) imports.push(ps[1]);
    });
  }
  return { symbols, imports: [...new Set(imports)] };
}

function buildGraph(sources) {
  const names = new Set(sources.map(s => s.path));
  const modules = sources.filter(s => CODE.test(s.path)).map(s => ({ path: s.path, ...analyzeSource(s.path, s.content) }));
  const edges = [];
  for (const mod of modules) {
    for (const imp of mod.imports) {
      let base;
      if (/\.py$/i.test(mod.path)) {
        const dots = /^\.+/.exec(imp)?.[0].length || 0;
        base = dots ? path.posix.join(path.posix.dirname(mod.path), ...Array(dots - 1).fill('..'), imp.slice(dots).replace(/\./g, '/')) : imp.replace(/\./g, '/');
      } else if (imp.startsWith('.')) base = path.posix.join(path.posix.dirname(mod.path), slash(imp));
      else if (imp.startsWith('@/')) base = 'src/' + imp.slice(2);
      else continue;
      const stripped = base.replace(/\.(?:js|jsx|mjs|cjs)$/, '');
      const choices = [base, ...['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.py', '.ps1', '.psm1', '/index.ts', '/index.tsx', '/index.js', '/__init__.py'].map(ext => stripped + ext)];
      const target = choices.find(n => names.has(n));
      if (target && target !== mod.path && !edges.some(e => e.source === mod.path && e.target === target)) edges.push({ source: mod.path, target });
    }
  }
  return { modules, edges };
}

function psQuote(s) { return "'" + s.replace(/'/g, "''") + "'"; }
function shQuote(s) { return "'" + s.replace(/'/g, "'\\''") + "'"; }
function language(file) {
  const ext = file.split('.').pop()?.toLowerCase();
  return ({ ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript', js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript', py: 'python', ps1: 'powershell', psm1: 'powershell', json: 'json', jsonc: 'json', md: 'markdown', yml: 'yaml', rs: 'rust', sh: 'shell', cs: 'csharp', kt: 'kotlin', kts: 'kotlin', fsx: 'fsharp', rb: 'ruby', jl: 'julia', pl: 'perl', hs: 'haskell', ex: 'elixir', exs: 'elixir', ml: 'ocaml', cc: 'cpp', cxx: 'cpp', sc: 'scala' })[ext] || ext || 'plaintext';
}
module.exports = { IGNORED, SOURCE, CODE, LIMIT, within, safePath, scanLocal, flatten, analyzeSource, buildGraph, psQuote, shQuote, slash, language };
