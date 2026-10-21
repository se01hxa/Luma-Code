const { app, BrowserWindow, ipcMain, dialog, shell, Menu, clipboard } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { fork } = require('node:child_process');
const { pathToFileURL, fileURLToPath } = require('node:url');
const { Client } = require('ssh2');
const chokidar = require('chokidar');
const pty = require('@lydell/node-pty');
const rpc = require('vscode-jsonrpc/node');
const core = require('./core.cjs');
const { createPrivacy } = require('./privacy.cjs');
let privacy, installer;
const installTools=require('./installers.cjs');
const runtimeTools = require('./runtimes.cjs');
const { buildPlan, powershellCommand } = require('./runners.cjs');

let win, workspace, watcher, pythonServer, pythonStarting, closing = false;
let config = { recent: [], recentFiles: [], profiles: [], hosts: {}, privacy: { mode: 'always' }, runtimes: { overrides: {}, custom: [] }, theme: { preset: 'midnight', accent: '#7dd3bc', background: '#15171c', image: '', opacity: 88, blur: 0, fontSize: 14, fontFamily: 'Cascadia Code', minimap: false, wordWrap: false, tabSize: 2, autoSave: false, openAnimation: true, animationDuration: 1100, soundEnabled: true, soundVolume: 35, clickSound: 'tock', typingSound: true } };
const pickedFiles = new Set();
const terminals = new Map();
const emit = (name, value) => { if (win && !win.isDestroyed()) win.webContents.send(name, value); };
const configPath = () => path.join(app.getPath('userData'), 'settings.json');
let configWrite = Promise.resolve();
const saveConfig = () => { const text=JSON.stringify(config,null,2); const pending=configWrite.catch(()=>{}).then(()=>fs.writeFile(configPath(),text,'utf8')); configWrite=pending;return pending; };
const handle = (name, fn) => ipcMain.handle(name, async (event, ...args) => {
  if (event.sender !== win?.webContents || event.senderFrame !== win.webContents.mainFrame) throw Error('요청을 허용할 수 없습니다.');
  return fn(...args);
});
const callSftp = (sftp, method, ...args) => new Promise((resolve, reject) => sftp[method](...args, (e, data) => e ? reject(e) : resolve(data)));
const ws = () => { if (!workspace) throw Error('먼저 폴더를 열어주세요.'); return workspace; };

async function safeRemote(w, relative, missing = false) {
  if (typeof relative !== 'string' || relative.includes('\0') || relative.startsWith('/') || relative.includes('\\')) throw Error('올바르지 않은 원격 경로입니다.');
  const target = path.posix.resolve(w.root, relative);
  if (!core.within(w.root, target, 'linux')) throw Error('작업 폴더 밖에는 접근할 수 없습니다.');
  let real;
  try { real = await callSftp(w.sftp, 'realpath', target); }
  catch (e) {
    if (!missing || e.code !== 2) throw e;
    real = path.posix.join(await callSftp(w.sftp, 'realpath', path.posix.dirname(target)), path.posix.basename(target));
  }
  if (!core.within(w.root, real, 'linux')) throw Error('작업 폴더 밖을 가리키는 링크입니다.');
  return target;
}
const resolvePath = (w, rel, missing = false) => w.remote ? safeRemote(w, rel, missing) : core.safePath(w.root, rel, missing);
async function snapshot() {
  const w = ws();
  let scan;
  if (w.filesOnly) {
    const tree = [];
    for (const relative of w.files) { try { if ((await fs.stat(await core.safePath(w.root, relative))).isFile()) tree.push({ name: path.basename(relative), path: relative, kind: 'file' }); } catch {} }
    scan = { tree: tree.sort((a, b) => a.name.localeCompare(b.name)), count: tree.length, truncated: false };
  } else if (!w.remote) scan = await core.scanLocal(w.root);
  else {
    let count = 0, truncated = false;
    const visit = async (relative = '', depth = 0) => {
      if (depth > 22) { truncated = true; return []; }
      const folder = await safeRemote(w, relative);
      const entries = await callSftp(w.sftp, 'readdir', folder), tree = [];
      entries.sort((a, b) => Number(b.attrs.isDirectory()) - Number(a.attrs.isDirectory()) || a.filename.localeCompare(b.filename));
      for (const entry of entries) {
        if (core.IGNORED.has(entry.filename) || entry.attrs.isSymbolicLink() || entry.filename.startsWith('.luma-save-')) continue;
        if (count >= core.LIMIT) { truncated = true; break; }
        if (!entry.attrs.isDirectory() && !entry.attrs.isFile()) continue;
        count++;
        const rel = relative ? `${relative}/${entry.filename}` : entry.filename;
        const node = { name: entry.filename, path: rel, kind: entry.attrs.isDirectory() ? 'directory' : 'file' };
        if (node.kind === 'directory') { try { node.children = await visit(rel, depth + 1); } catch { node.children = []; node.inaccessible = true; } }
        tree.push(node);
      }
      return tree;
    };
    scan = { tree: await visit(), count, truncated };
  }
  w.tree = scan.tree;
  return { ...scan, root: w.root, name: w.name, remote: !!w.remote, host: w.host || '', filesOnly: !!w.filesOnly };
}

async function readFile(relative, w = ws()) {
  const full = await resolvePath(w, relative);
  const stat = w.remote ? await callSftp(w.sftp, 'stat', full) : await fs.stat(full);
  if (stat.size > 2 * 1024 * 1024) throw Error('이 편집기는 최대 2 MB의 텍스트 파일을 열 수 있습니다.');
  const buf = w.remote ? await callSftp(w.sftp, 'readFile', full) : await fs.readFile(full);
  if (buf.includes(0)) throw Error('바이너리 파일은 코드 편집기로 열 수 없습니다.');
  const bom = buf[0] === 239 && buf[1] === 187 && buf[2] === 191;
  let content;
  try { content = new TextDecoder('utf-8', { fatal: true }).decode(buf); }
  catch { throw Error('UTF-8 형식의 텍스트 파일만 지원합니다. 다른 인코딩의 파일은 먼저 UTF-8로 변환해주세요.'); }
  privacy?.observe(relative,content);
  return { content, mtime: w.remote ? stat.mtime * 1000 : stat.mtimeMs, bom, language: core.language(relative) };
}
async function sources() {
  const w = ws();
  const files = core.flatten(w.tree || []).filter(p => core.SOURCE.test(p));
  const result = [];
  let bytes = 0;
  for (const p of files.slice(0, 650)) {
    try {
      const data = await readFile(p, w);
      bytes += Buffer.byteLength(data.content);
      if (bytes > 18 * 1024 * 1024) break;
      result.push({ path: p, ...data });
    } catch { /* Unreadable and binary files do not participate in indexing. */ }
  }
  return { files: result, truncated: result.length < files.length, total: files.length };
}
function stopPython() {
  if (pythonServer) { pythonServer.connection.dispose(); pythonServer.child.kill(); pythonServer = undefined; }
  pythonStarting = undefined;
}
async function clearWorkspace() {
  if (watcher) { await watcher.close(); watcher = undefined; }
  stopPython();
  for (const id of [...terminals.keys()]) closeTerminal(id);
  const prev = workspace; workspace = undefined;
  prev?.client?.end();
}
async function openLocal(folder, files) {
  const root = await fs.realpath(folder);
  if (!(await fs.stat(root)).isDirectory()) throw Error('폴더를 선택해주세요.');
  await clearWorkspace();
  workspace = { root, name: files ? '열린 파일' : path.basename(root), remote: false, filesOnly: !!files, files: new Set(files || []) };
  if (!files) config.recent = [root, ...config.recent.filter(p => p !== root)].slice(0, 8);
  await saveConfig();
  let timer;
  watcher = chokidar.watch(files ? files.map(file => path.join(root, file)) : root, { ignoreInitial: true, depth: files ? 0 : 22, ignored: files ? undefined : p => core.slash(path.relative(root, p)).split('/').some(s => core.IGNORED.has(s)), awaitWriteFinish: { stabilityThreshold: 250, pollInterval: 100 } });
  watcher.on('all', (_type, file) => { clearTimeout(timer); timer = setTimeout(() => emit('workspace:changed', { path: core.slash(path.relative(root, file)) }), 400); });
  watcher.on('error', () => {});
  return snapshot();
}

async function openPickedFile(file) {
  const actual = await fs.realpath(file);
  if (!pickedFiles.has(actual) && !(config.recentFiles || []).includes(actual)) throw Error('파일 열기에서 파일을 선택해주세요.');
  const root = path.dirname(actual), name = path.basename(actual);
  await readFile(name, { root, remote: false });
  const same = !!workspace && !workspace.remote && core.within(workspace.root, actual);
  let result;
  if (same) {
    const relative = core.slash(path.relative(workspace.root, actual));
    if (workspace.filesOnly) { workspace.files.add(relative); watcher?.add(actual); }
    result = { workspace: await snapshot(), path: relative, sameWorkspace: true };
  } else {
    runtimeManager.invalidate();
    result = { workspace: await openLocal(root, [name]), path: name, sameWorkspace: false };
  }
  config.recentFiles = [actual, ...(config.recentFiles || []).filter(p => p !== actual)].slice(0, 8);
  await saveConfig();
  return result;
}

const runtimeManager = runtimeTools.createManager(() => config.runtimes || { overrides: {}, custom: [] });
const localRuntime = (refresh = false) => runtimeManager.scan(workspace?.remote ? undefined : workspace?.root, refresh);
const runtimeView = report => { const { env, ...view } = report; return { ...view, remote: !!workspace?.remote }; };
function unpacked(p) { return p.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1'); }

function runSpec(relative, w, runtime) {
  const full = w.remote ? path.posix.join(w.root, relative) : path.join(w.root, relative);
  const ext = relative.split('.').pop().toLowerCase();
  if (w.remote) {
    let command;
    if (ext === 'py') command = `if [ -x .venv/bin/python ]; then .venv/bin/python -u ${core.shQuote(full)}; elif command -v python3 >/dev/null 2>&1; then python3 -u ${core.shQuote(full)}; elif command -v python >/dev/null 2>&1; then python -u ${core.shQuote(full)}; else printf 'Python이 설치되어 있지 않습니다.\\n'; fi`;
    else if (['js', 'mjs', 'cjs'].includes(ext)) command = `node ${core.shQuote(full)}`;
    else if (['ts', 'tsx', 'mts', 'cts'].includes(ext)) command = `if [ -x node_modules/.bin/tsx ]; then node_modules/.bin/tsx ${core.shQuote(full)}; elif command -v tsx >/dev/null 2>&1; then tsx ${core.shQuote(full)}; elif [ ${core.shQuote(ext)} != 'tsx' ]; then node ${core.shQuote(full)}; else printf '이 서버에 tsx를 설치해주세요.\\n'; fi`;
    else if (ext === 'ps1') command = `pwsh -NoProfile -File ${core.shQuote(full)}`;
    else if (ext === 'sh') command = `bash ${core.shQuote(full)}`;
    else throw Error('실행 지원 형식: .py, .ts, .tsx, .js, .ps1, .sh');
    return `cd ${core.shQuote(w.root)} && ${command}`;
  }
  throw Error('로컬 실행기는 buildPlan을 사용합니다.');
}

function closeTerminal(id) {
  const term = terminals.get(id);
  if (!term) return;
  terminals.delete(id);
  try { term.remote ? term.stream.end() : term.process.kill(); } catch {}
  // onExit removes compiler output after the process tree has stopped.
}
async function createTerminal({ runPath, cols = 100, rows = 24 } = {}) {
  const w = ws();
  if (runPath) await resolvePath(w, runPath);
  const id = require('node:crypto').randomUUID();
  if(runPath && privacy){
    const envs=core.flatten(w.tree||[]).filter(p=>/(?:^|\/)(?:\.env(?:[.\w-]*)?|[^/]+\.env)$/i.test(p)).slice(0,60);
    if(!w.remote) for(const name of ['.env','.env.local','.env.development','.env.production']) if(!envs.includes(name))envs.push(name);
    for(const file of envs)try{await readFile(file,w);}catch{}
  }
  const redactor=privacy.stream(), output=data=>{const text=redactor.push(data);if(text)emit('terminal:data',{id,data:text});}, flush=()=>{const text=redactor.push('',true);if(text)emit('terminal:data',{id,data:text});};
  const name = runPath ? path.basename(runPath) : w.remote ? 'SSH' : 'PowerShell';
  if (w.remote) {
    const command = runPath && runSpec(runPath, w);
    const stream = await new Promise((resolve, reject) => {
      const callback = (e, stream) => e ? reject(e) : resolve(stream);
      if (command) w.client.exec(command, { pty: { term: 'xterm-256color', cols, rows } }, callback);
      else w.client.shell({ term: 'xterm-256color', cols, rows }, callback);
    });
    terminals.set(id, { stream, remote: true });
    stream.on('data', data => output(data.toString('utf8')));
    stream.stderr.on('data', data => output(data.toString('utf8')));
    stream.on('close', code => { flush(); terminals.delete(id); emit('terminal:exit', { id, code: code ?? 0 }); });
    if (!runPath) stream.write(`cd ${core.shQuote(w.root)}\n`);
  } else {
    const runtime = await localRuntime();
    if (workspace !== w) throw Error('작업 공간이 변경되었습니다. 현재 파일에서 다시 실행해주세요.');
    const shellExe = runtime.powershell && !/\.(?:bat|cmd|ps1)$/i.test(runtime.powershell) ? runtime.powershell : runtimeTools.systemPS();
    const spec = runPath && await buildPlan(path.join(w.root, runPath), runtime, config.runtimes || {}, path.join(app.getPath('temp'), 'luma-code-runs')); 
    if (workspace !== w) { if (spec?.cleanup) await fs.rm(spec.cleanup, { recursive: true, force: true }); throw Error('작업 공간이 변경되었습니다. 현재 파일에서 다시 실행해주세요.'); }
    const args = ['-NoLogo', '-NoProfile', ...(spec ? ['-Command', powershellCommand(spec.steps)] : [])];
    let processPty;
    const cleanup = () => spec?.cleanup && fs.rm(spec.cleanup, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }).catch(() => {});
    try { processPty = pty.spawn(shellExe, args, { name: 'xterm-256color', cols, rows, cwd: w.root, env: { ...(spec?.env || runtime.env), TERM: 'xterm-256color', COLORTERM: 'truecolor' } }); }
    catch (e) { cleanup(); throw e; }
    terminals.set(id, { process: processPty, remote: false });
    processPty.onData(output);
    processPty.onExit(({ exitCode }) => { flush(); cleanup(); terminals.delete(id); emit('terminal:exit', { id, code: exitCode }); });
  }
  return { id, name, run: !!runPath };
}

async function startPython() {
  if (pythonServer) return pythonServer;
  if (pythonStarting) return pythonStarting;
  const w = ws();
  if (w.remote) throw Error('Python 언어 서버는 로컬 작업 폴더에서 사용할 수 있습니다.');
  pythonStarting = (async () => {
    const runtime = await localRuntime();
    if (workspace !== w) throw Error('작업 폴더가 변경되었습니다.');
    const child = fork(unpacked(require.resolve('pyright/langserver.index.js')), ['--stdio'], { silent: true, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true, cwd: w.root });
    const connection = rpc.createMessageConnection(new rpc.StreamMessageReader(child.stdout), new rpc.StreamMessageWriter(child.stdin));
    connection.onRequest('workspace/configuration', params => params.items.map(item => item.section === 'python' ? { pythonPath: runtime.python || undefined, analysis: { diagnosticMode: 'openFilesOnly', typeCheckingMode: 'basic', autoSearchPaths: true } } : { diagnosticMode: 'openFilesOnly', typeCheckingMode: 'basic' }));
    connection.onRequest('client/registerCapability', () => null);
    connection.onNotification('textDocument/publishDiagnostics', params => emit('python:diagnostics', params));
    connection.listen();
    child.on('error', () => { if (pythonServer?.child === child) stopPython(); });
    child.on('exit', () => { if (pythonServer?.child === child) pythonServer = undefined; });
    child.stderr.on('data', () => {});
    try {
      await Promise.race([
        connection.sendRequest('initialize', { processId: process.pid, rootUri: pathToFileURL(w.root).href, capabilities: { workspace: { configuration: true }, textDocument: { completion: { completionItem: { snippetSupport: true } }, hover: { contentFormat: ['markdown', 'plaintext'] }, publishDiagnostics: {} } }, workspaceFolders: [{ uri: pathToFileURL(w.root).href, name: w.name }] }),
        new Promise((_, reject) => { const timer = setTimeout(() => reject(Error('Python 언어 서버 응답 시간이 초과되었습니다.')), 15000); timer.unref(); }),
      ]);
      if (workspace !== w) throw Error('작업 폴더가 변경되었습니다.');
      connection.sendNotification('initialized', {});
      pythonServer = { child, connection };
      return pythonServer;
    } catch (e) { connection.dispose(); child.kill(); throw e; }
    finally { pythonStarting = undefined; }
  })();
  return pythonStarting;
}

async function connectSSH(profile) {
  const { host, username, port = 22, folder = '.', password, keyPath, passphrase } = profile;
  if (!host?.trim() || !username?.trim() || !Number.isInteger(Number(port)) || port < 1 || port > 65535) throw Error('호스트, 사용자, 포트를 확인해주세요.');
  const client = new Client();
  const privateKey = keyPath ? await fs.readFile(keyPath) : undefined;
  const key = `${host}:${port}`;
  try {
    await new Promise((resolve, reject) => {
      client.once('ready', resolve).once('error', reject);
      client.connect({ host: host.trim(), port: Number(port), username: username.trim(), password: password || undefined, privateKey, passphrase: passphrase || undefined, readyTimeout: 20000, keepaliveInterval: 15000, hostHash: 'sha256',
        hostVerifier(hash, callback) {
          if (config.hosts[key] === hash) { callback(true); return; }
          const changed = !!config.hosts[key];
          dialog.showMessageBox(win, { type: changed ? 'warning' : 'question', title: 'SSH 호스트 확인', message: changed ? '저장된 서버 지문과 일치하지 않습니다.' : '새 SSH 서버를 신뢰하시겠습니까?', detail: `${key}\nSHA256 (hex): ${hash}\n\n서버 관리자가 제공한 지문과 비교해주세요.`, buttons: ['취소', '신뢰하고 연결'], defaultId: 0, cancelId: 0 }).then(async result => {
            if (result.response === 1) { config.hosts[key] = hash; await saveConfig(); }
            callback(result.response === 1);
          }).catch(() => callback(false));
        },
      });
    });
    const sftp = await new Promise((resolve, reject) => client.sftp((e, value) => e ? reject(e) : resolve(value)));
    const root = await callSftp(sftp, 'realpath', folder || '.');
    if (!(await callSftp(sftp, 'stat', root)).isDirectory()) throw Error('원격 작업 폴더가 디렉터리가 아닙니다.');
    await clearWorkspace();
    workspace = { remote: true, root, sftp, client, host, name: path.posix.basename(root) || root };
    client.on('error', e => emit('ssh:closed', { message: e.message }));
    client.on('close', () => { if (workspace?.client === client) { workspace = undefined; emit('ssh:closed', { message: 'SSH 연결이 종료되었습니다.' }); } });
    const saved = { host, port: Number(port), username, folder, keyPath: keyPath || '' };
    config.profiles = [saved, ...config.profiles.filter(p => !(p.host === host && p.username === username && p.port === Number(port)))].slice(0, 6);
    await saveConfig();
    return await snapshot();
  } catch (e) { client.end(); throw e; }
}

function registerHandlers() {
  handle('bootstrap', async () => ({ config, version: app.getVersion(), platform: process.platform, initialFolder: process.argv.includes('--workspace') ? process.argv[process.argv.indexOf('--workspace') + 1] : null }));
  handle('clipboard:write', text => { if (typeof text === 'string' && text.length < 100000) clipboard.writeText(text); });
  handle('workspace:choose', async () => { const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] }); return r.canceled ? null : r.filePaths[0]; });
  handle('file:choose', async () => {
    const r = await dialog.showOpenDialog(win, { title: '파일 열기', properties: ['openFile'], filters: [{ name: '모든 파일', extensions: ['*'] }, { name: '코드 파일', extensions: ['py', 'ts', 'tsx', 'js', 'jsx', 'ps1', 'json', 'md', 'txt'] }] });
    if (r.canceled || !r.filePaths[0]) return null;
    const actual = await fs.realpath(r.filePaths[0]); pickedFiles.add(actual); return actual;
  });
  handle('file:open', openPickedFile);
  handle('workspace:open', async folder => { runtimeManager.invalidate(); return openLocal(folder); });
  handle('workspace:refresh', snapshot);
  handle('file:read', readFile);
  handle('file:write', async (relative, content, expected, bom = false) => {
    if (typeof content !== 'string' || Buffer.byteLength(content) > 2 * 1024 * 1024) throw Error('파일 크기 제한은 2 MB입니다.');
    const w = ws(), full = await resolvePath(w, relative, true);
    let stat;
    try { stat = w.remote ? await callSftp(w.sftp, 'stat', full) : await fs.stat(full); }
    catch (e) { if (e.code !== 'ENOENT' && e.code !== 2) throw e; }
    const mtime = stat && (w.remote ? stat.mtime * 1000 : stat.mtimeMs);
    if (expected !== null && expected !== undefined && (mtime === undefined || Math.abs(mtime - expected) > 1)) throw Error('CONFLICT: 다른 프로그램에서 파일이 변경되었거나 삭제되었습니다. 다시 열어 내용을 확인해주세요.');
    const data = (bom ? '\uFEFF' : '') + content;
    if (w.remote) await callSftp(w.sftp, 'writeFile', full, data, { encoding: 'utf8' });
    else {
      const temp = path.join(path.dirname(full), `.luma-save-${require('node:crypto').randomUUID()}`);
      try {
        await fs.writeFile(temp, data, { encoding: 'utf8', mode: stat?.mode });
        for (let attempt = 0; ; attempt++) {
          try { await fs.rename(temp, full); break; }
          catch (e) {
            if (process.platform !== 'win32' || !['EPERM', 'EACCES', 'EBUSY'].includes(e.code) || attempt >= 6) throw e;
            await new Promise(resolve => setTimeout(resolve, 30 * 2 ** attempt));
          }
        }
      }
      finally { await fs.rm(temp, { force: true }).catch(() => {}); }
    }
    return readFile(relative, w);
  });
  handle('file:create', async (relative, directory) => {
    const w = ws(), full = await resolvePath(w, relative, true);
    if (w.filesOnly && directory) throw Error('폴더를 만들려면 먼저 폴더 열기로 작업 폴더를 열어주세요.');
    if (w.remote) { if (directory) await callSftp(w.sftp, 'mkdir', full); else await callSftp(w.sftp, 'writeFile', full, '', { flag: 'wx' }); }
    else if (directory) await fs.mkdir(full); else await fs.writeFile(full, '', { flag: 'wx' });
    if (w.filesOnly) { w.files.add(relative); watcher?.add(full); }
    return snapshot();
  });
  handle('file:rename', async (relative, target) => {
    const w = ws(), full = await resolvePath(w, relative), next = await resolvePath(w, target, true);
    try { if (w.remote) await callSftp(w.sftp, 'stat', next); else await fs.stat(next); throw Error('같은 이름의 파일이 이미 있습니다.'); }
    catch (e) { if (e.code !== 'ENOENT' && e.code !== 2) throw e; }
    if (w.remote) await callSftp(w.sftp, 'rename', full, next); else await fs.rename(full, next);
    if (w.filesOnly) { w.files.delete(relative); w.files.add(target); watcher?.unwatch(full); watcher?.add(next); }
    return snapshot();
  });
  handle('file:trash', async relative => {
    const w = ws();
    if (w.remote) throw Error('원격 파일 삭제는 지원하지 않습니다.');
    if (!relative) throw Error('작업 폴더 자체는 삭제할 수 없습니다.');
    await shell.trashItem(await resolvePath(w, relative)); if (w.filesOnly) w.files.delete(relative); return snapshot();
  });
  handle('workspace:sources', sources);
  handle('workspace:graph', async () => { const s = await sources(); return { ...core.buildGraph(s.files), truncated: s.truncated, total: s.total }; });
  handle('workspace:search', async (query, sensitive = false) => {
    if (typeof query !== 'string' || !query || query.length > 512) return { matches: [], truncated: false };
    const s = await sources(), matches = [], needle = sensitive ? query : query.toLowerCase();
    for (const file of s.files) {
      for (const [i, line] of file.content.split(/\r?\n/).entries()) {
        const index = (sensitive ? line : line.toLowerCase()).indexOf(needle);
        if (index >= 0) matches.push({ path: file.path, line: i + 1, column: index + 1, text: privacy.redact(line.slice(Math.max(0, index - 80), index + 180).trim()) });
        if (matches.length >= 300) return { matches, truncated: true };
      }
    }
    return { matches, truncated: s.truncated };
  });
  handle('privacy:status',()=>privacy.status());
  handle('privacy:set',async mode=>{if(!['always','auto','off'].includes(mode))throw Error('올바른 보호 방식을 선택해주세요.');config.privacy={mode};await saveConfig();return privacy.update();});
  handle('settings:save', async patch => {
    if (patch.theme) config.theme = { ...config.theme, ...patch.theme };
    if (patch.recent) config.recent = config.recent.filter(p => patch.recent.includes(p));
    await saveConfig(); return config;
  });
  handle('theme:image', async () => {
    const result = await dialog.showOpenDialog(win, { filters: [{ name: '배경 이미지 / GIF', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }], properties: ['openFile'] });
    if (result.canceled) return null;
    const stat = await fs.stat(result.filePaths[0]);
    if (stat.size > 12 * 1024 * 1024) throw Error('12 MB 이하의 이미지를 선택해주세요.');
    const buf = await fs.readFile(result.filePaths[0]), ext = path.extname(result.filePaths[0]).slice(1).toLowerCase();
    return `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${buf.toString('base64')}`;
  });
  handle('ssh:key', async () => { const r = await dialog.showOpenDialog(win, { title: 'SSH 개인 키 선택', properties: ['openFile'] }); return r.canceled ? null : r.filePaths[0]; });
  handle('ssh:connect', connectSSH);
  handle('ssh:disconnect', async () => { await clearWorkspace(); return true; });
  handle('runtime:list', async refresh => runtimeView(await localRuntime(!!refresh)));
  handle('install:catalog',()=>installer.catalog());
  handle('install:status',()=>installer.status());
  handle('install:start',ids=>{const selected=installTools.selection(ids);if(installer.status().running)throw Error('다른 언어 설치가 진행 중입니다.');void installer.start(selected).catch(e=>emit('install:error',{message:e.message}));return true;});
  handle('install:site',id=>{const entry=installTools.CATALOG.find(d=>d.id===id);if(!entry)throw Error('등록되지 않은 언어입니다.');return shell.openExternal(entry.site);});
  handle('runtime:choose', async directory => { const r = await dialog.showOpenDialog(win, { title: directory ? '언어 설치 폴더 선택' : '언어 실행 파일 선택', properties: [directory ? 'openDirectory' : 'openFile'] }); return r.canceled ? null : r.filePaths[0]; });
  handle('runtime:save', async input => {
    const root = workspace?.remote ? undefined : workspace?.root;
    const { result, definition } = await runtimeManager.validate(input.id, input.path, root, input.custom);
    const previous = config.runtimes, next = { overrides: { ...(previous?.overrides || {}) }, custom: [...(previous?.custom || [])] };
    if (definition.custom) {
      if (next.custom.some(c => c.id !== definition.id && runtimeTools.customDefinition(c).extensions.some(ext => definition.extensions.includes(ext)))) throw Error('다른 사용자 실행기가 이미 이 확장자를 사용합니다.');
      if (next.custom.length >= 40 && !next.custom.some(c => c.id === definition.id)) throw Error('사용자 실행기는 최대 40개까지 등록할 수 있습니다.');
      next.custom = next.custom.filter(c => c.id !== definition.id);
      next.custom.push({ id: definition.id, name: definition.name, extensions: definition.extensions, path: result.path, args: definition.args, versionArgs: definition.versionArgs });
    } else next.overrides[definition.id] = result.path;
    config.runtimes = next;
    try { await saveConfig(); } catch (e) { config.runtimes = previous; throw e; }
    stopPython(); runtimeManager.invalidate(); return runtimeView(await localRuntime());
  });
  handle('runtime:reset', async id => {
    if (typeof id !== 'string') throw Error('올바른 실행기를 선택해주세요.');
    const previous = config.runtimes, next = { overrides: { ...(previous?.overrides || {}) }, custom: (previous?.custom || []).filter(c => c.id !== id) };
    delete next.overrides[id]; config.runtimes = next;
    try { await saveConfig(); } catch (e) { config.runtimes = previous; throw e; }
    stopPython(); runtimeManager.invalidate(); return runtimeView(await localRuntime());
  });
  handle('terminal:create', createTerminal);
  handle('terminal:write', (id, data) => { const t = terminals.get(id); if (typeof data === 'string' && data.length < 1e6) t?.remote ? t.stream.write(data) : t?.process.write(data); });
  handle('terminal:resize', (id, cols, rows) => { const t = terminals.get(id); if (Number.isInteger(cols) && Number.isInteger(rows) && cols > 1 && rows > 1 && cols < 1000 && rows < 1000) { try { t?.remote ? t.stream.setWindow(rows, cols, 0, 0) : t?.process.resize(cols, rows); } catch {} } });
  handle('terminal:close', closeTerminal);
  handle('python:request', async (method, params) => {
    if (!['textDocument/completion', 'completionItem/resolve', 'textDocument/hover', 'textDocument/signatureHelp', 'textDocument/definition'].includes(method)) throw Error('지원하지 않는 언어 서버 요청입니다.');
    const server = await startPython(); return server.connection.sendRequest(method, params);
  });
  handle('python:notify', async (method, params) => {
    if (!['textDocument/didOpen', 'textDocument/didChange', 'textDocument/didClose', 'textDocument/didSave'].includes(method)) throw Error('지원하지 않는 요청입니다.');
    const w = ws(), full = fileURLToPath(params.textDocument.uri);
    if (w.remote || !core.within(w.root, full)) throw Error('작업 폴더의 Python 파일만 지원합니다.');
    const server = await startPython(); server.connection.sendNotification(method, params);
  });
  handle('window:action', action => {
    if (action === 'minimize') win.minimize();
    if (action === 'maximize') win.isMaximized() ? win.unmaximize() : win.maximize();
    if (action === 'close') win.close();
    if (action === 'close-confirmed') { closing = true; win.close(); }
  });
  handle('dialog:confirm', async (message, detail, buttons = ['취소', '계속']) => (await dialog.showMessageBox(win, { type: 'question', message, detail, buttons, defaultId: 0, cancelId: 0 })).response);
}

app.whenReady().then(async () => {
  app.setAppUserModelId('dev.luma.code');
  if (process.env.LUMA_TEST_USERDATA) app.setPath('userData', process.env.LUMA_TEST_USERDATA);
  try { config = { ...config, ...JSON.parse(await fs.readFile(configPath(), 'utf8')) }; } catch {}
  const setupIndex=process.argv.indexOf('--setup-options');
  if(process.argv.includes('--setup-run')&&setupIndex>=0){
    try{const options=JSON.parse(await fs.readFile(process.argv[setupIndex+1],'utf8'));if(['always','auto','off'].includes(options.privacy?.mode))config.privacy={mode:options.privacy.mode};for(const key of ['soundEnabled','openAnimation'])if(typeof options.theme?.[key]==='boolean')config.theme[key]=options.theme[key];await saveConfig();}catch(e){console.error('Setup preferences: '+e.message);}
  }
  const reportPath=path.join(app.getPath('userData'),'language-install-report.json');let initialState;try{initialState=JSON.parse(await fs.readFile(reportPath,'utf8'));}catch{}
  installer=installTools.createInstaller({reportPath,initialState,onChange:state=>emit('install:changed',state),onComplete:async items=>{
    const updatedEnv=await runtimeTools.freshEnvironment();
    for(const item of items.filter(i=>i.status==='done')){
      config.runtimes ||= {overrides:{},custom:[]};config.runtimes.overrides ||= {};
      delete config.runtimes.overrides[item.id];
      if(item.id==='java')delete config.runtimes.overrides.javac;
      if(item.id==='c')delete config.runtimes.overrides.cpp;
      if(item.path)config.runtimes.overrides[item.id]=item.path;
      else {
        const latest=await runtimeTools.newest(item.id,updatedEnv);
        if(latest)config.runtimes.overrides[item.id]=latest.path;
        if(item.id==='java'){const compiler=await runtimeTools.newest('javac',updatedEnv);if(compiler)config.runtimes.overrides.javac=compiler.path;}
        if(item.id==='c'){const cpp=await runtimeTools.newest('cpp',updatedEnv);if(cpp)config.runtimes.overrides.cpp=cpp.path;}
      }
    }
    await saveConfig();stopPython();runtimeManager.invalidate();
    const report=await localRuntime();for(const item of items.filter(i=>i.status==='done')){const found=report.items.find(r=>r.id===item.id);if(!found?.ready)item.error='설치는 완료됐지만 실행 경로 또는 필수 도구 확인이 필요합니다. 언어와 실행기에서 경로를 지정해주세요.';}
  }});
  if(process.argv.includes('--setup-run')){
    const index=process.argv.indexOf('--setup-languages'),ids=index>=0?(process.argv[index+1]||'').split(',').filter(Boolean):[];
    try{const result=ids.length?await installer.start(ids):{items:[]};app.exit(result.items.some(i=>i.status==='error')?10:0);}catch(e){console.error(e.message);app.exit(10);}return;
  }
  privacy = await createPrivacy(() => config.privacy || {mode:'always'}, emit);
  Menu.setApplicationMenu(null);
  win = new BrowserWindow({ width: 1440, height: 940, minWidth: 980, minHeight: 650, backgroundColor: '#15171c', frame: false, show: false, title: 'Luma Code', icon: path.join(__dirname, '../assets/icon.png'), webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false } });
  registerHandlers();
  void privacy.start();
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  win.on('close', e => { if (!closing) { e.preventDefault(); emit('menu:action', 'app-close'); } });
  win.once('ready-to-show', () => win.show());
  if (process.argv.includes('--dev')) await win.loadURL('http://127.0.0.1:5173');
  else await win.loadFile(path.join(__dirname, '../dist/index.html'));
}).catch(e => { dialog.showErrorBox('Luma Code 시작 실패', e.stack || e.message); app.quit(); });
app.on('window-all-closed', () => { privacy?.stop(); clearWorkspace().finally(() => app.quit()); });
