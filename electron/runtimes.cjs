const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { psQuote } = require('./core.cjs');
const win = process.platform === 'win32';
const systemPS = () => path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const definition = (id, name, extensions, commands, match, options = {}) => ({ id, name, extensions, commands, match, versionArgs: ['--version'], ...options });
const CATALOG = [
  definition('python', 'Python', ['py'], ['python3', 'python', 'py'], /Python\s+\d/i, { homes: ['PYTHON_HOME'], folders: ['Python', 'Python3*'], local: ['Programs/Python/Python*'] }),
  definition('node', 'JavaScript / TypeScript', ['js', 'mjs', 'cjs', 'ts', 'tsx', 'mts', 'cts'], ['node'], /^v\d+\.\d+/m, { homes: ['NODE_HOME', 'NVM_SYMLINK', 'VOLTA_HOME'], folders: ['nodejs'], local: ['Volta/bin', 'fnm_multishells/*'] }),
  definition('powershell', 'PowerShell', ['ps1'], ['pwsh', 'powershell'], /(?:PowerShell|PSEdition)/i, { versionArgs: ['-NoProfile', '-NonInteractive', '-Command', '"PowerShell " + $PSVersionTable.PSVersion.ToString()'], folders: ['PowerShell/7'], extra: [systemPS()] }),
  definition('kotlin', 'Kotlin', ['kt', 'kts'], ['kotlinc'], /kotlinc(?:-jvm)?\s+\d/i, { homes: ['KOTLIN_HOME'], folders: ['Kotlin', 'Kotlin/kotlinc', 'JetBrains/*/plugins/Kotlin/kotlinc', 'Android/Android Studio/plugins/Kotlin/kotlinc'], sdk: 'kotlin', needs: ['java'], timeout: 15000, versionArgs: ['-version'] }),
  definition('java', 'Java', ['java'], ['java'], /(?:openjdk|java)\s+(?:version\s+)?["\d]/i, { homes: ['JAVA_HOME', 'JDK_HOME'], folders: ['Java/*', 'Eclipse Adoptium/*', 'Microsoft/jdk*', 'Eclipse Foundation/*', 'Amazon Corretto/*', 'Android/openjdk/*', 'Android/Android Studio/jbr', 'JetBrains/*/jbr'], sdk: 'java', versionArgs: ['-version'], needs: ['javac'] }),
  definition('javac', 'Java · JDK 컴파일러', [], ['javac'], /javac\s+\d/i, { homes: ['JAVA_HOME', 'JDK_HOME'], folders: ['Java/*', 'Eclipse Adoptium/*', 'Microsoft/jdk*', 'Amazon Corretto/*', 'Android/openjdk/*', 'Android/Android Studio/jbr', 'JetBrains/*/jbr'], sdk: 'java', versionArgs: ['-version'] }),
  definition('c', 'C', ['c'], ['gcc', 'clang'], /(?:gcc|clang|Free Software Foundation)/i, { homes: ['LLVM_HOME'], folders: ['LLVM'], extra: ['C:/msys64/ucrt64/bin/gcc.exe', 'C:/msys64/mingw64/bin/gcc.exe', 'C:/mingw64/bin/gcc.exe'] }),
  definition('cpp', 'C++', ['cpp', 'cc', 'cxx'], ['g++', 'clang++'], /(?:g\+\+|clang|Free Software Foundation)/i, { homes: ['LLVM_HOME'], folders: ['LLVM'], extra: ['C:/msys64/ucrt64/bin/g++.exe', 'C:/msys64/mingw64/bin/g++.exe', 'C:/mingw64/bin/g++.exe'] }),
  definition('rust', 'Rust', ['rs'], ['rustc'], /rustc\s+\d/i, { homes: ['CARGO_HOME', 'RUSTUP_HOME'], user: ['.cargo/bin'] }),
  definition('go', 'Go', ['go'], ['go'], /go version go\d/i, { homes: ['GOROOT'], folders: ['Go'], versionArgs: ['version'] }),
  definition('dotnet', 'C# / F#', ['cs', 'fsx'], ['dotnet'], /\d+\.\d+\.\d+\s+\[/, { homes: ['DOTNET_ROOT'], folders: ['dotnet'], user: ['.dotnet'], versionArgs: ['--list-sdks'] }),
  definition('ruby', 'Ruby', ['rb'], ['ruby'], /ruby\s+\d/i, { homes: ['RUBY_HOME'], extraFolders: ['C:/Ruby*'], versionArgs: ['--version'] }),
  definition('php', 'PHP', ['php'], ['php'], /PHP\s+\d/i, { homes: ['PHP_HOME'], folders: ['PHP', 'PHP/*'], extraFolders: ['C:/php*', 'C:/xampp/php'] }),
  definition('lua', 'Lua', ['lua'], ['lua', 'lua54', 'lua53', 'luajit'], /Lua(?:JIT)?\s+\d/i, { homes: ['LUA_HOME'], versionArgs: ['-v'] }),
  definition('perl', 'Perl', ['pl'], ['perl'], /(?:This is perl|perl\s+\d)/i, { extraFolders: ['C:/Strawberry/perl/bin'], versionArgs: ['-v'] }),
  definition('r', 'R', ['r'], ['Rscript'], /Rscript.*version\s+\d/i, { homes: ['R_HOME'], folders: ['R/R-*', 'R/R-*/bin/x64'] }),
  definition('julia', 'Julia', ['jl'], ['julia'], /julia version\s+\d/i, { homes: ['JULIA_HOME'], local: ['Programs/Julia*'], user: ['.juliaup/bin'] }),
  definition('dart', 'Dart', ['dart'], ['dart'], /Dart SDK version:\s+\d/i, { homes: ['DART_HOME', 'FLUTTER_ROOT'], folders: ['Dart/dart-sdk'], user: ['flutter/bin/cache/dart-sdk'] }),
  definition('swift', 'Swift', ['swift'], ['swift'], /Swift version\s+\d/i, { homes: ['SWIFT_HOME'], folders: ['Swift/Toolchains/*/usr'] }),
  definition('bash', 'Bash', ['sh', 'bash'], ['bash'], /GNU bash, version\s+\d/i, { folders: ['Git/bin', 'Git/usr/bin'], extra: ['C:/msys64/usr/bin/bash.exe'] }),
  definition('haskell', 'Haskell', ['hs'], ['runghc', 'runhaskell'], /(?:runghc|GHC|Glasgow Haskell).*\d/i, { homes: ['GHCUP_INSTALL_BASE_PREFIX'], user: ['.ghcup/bin'] }),
  definition('nim', 'Nim', ['nim'], ['nim'], /Nim Compiler Version\s+\d/i, { homes: ['NIM_HOME'], user: ['.nimble/bin'] }),
  definition('zig', 'Zig', ['zig'], ['zig'], /^\d+\.\d+\.\d+/m, { homes: ['ZIG_HOME'], versionArgs: ['version'] }),
  definition('ocaml', 'OCaml', ['ml'], ['ocaml'], /OCaml.*version\s+\d/i, { homes: ['OCAML_HOME'], versionArgs: ['-version'] }),
  definition('racket', 'Racket', ['rkt'], ['racket'], /Racket v\d/i, { folders: ['Racket'] }),
  definition('elixir', 'Elixir', ['ex', 'exs'], ['elixir'], /Elixir\s+\d/i, { homes: ['ELIXIR_HOME'], folders: ['Elixir'] }),
  definition('groovy', 'Groovy', ['groovy'], ['groovy'], /Groovy Version:\s+\d/i, { homes: ['GROOVY_HOME'], sdk: 'groovy', needs: ['java'] }),
  definition('scala', 'Scala', ['scala', 'sc'], ['scala'], /Scala.*(?:version|\d+\.)/i, { homes: ['SCALA_HOME'], sdk: 'scala', needs: ['java'] }),
  definition('bun', 'Bun', [], ['bun'], /^\d+\.\d+\.\d+/m, { homes: ['BUN_INSTALL'], user: ['.bun/bin'] }),
  definition('deno', 'Deno', [], ['deno'], /^deno\s+\d/m, { homes: ['DENO_INSTALL'], user: ['.deno/bin'] }),
];
const envGet = (env, key) => env[Object.keys(env).find(k => k.toLowerCase() === key.toLowerCase())] || '';
function mergeEnv(...envs) { const result = {}; for (const env of envs) for (const [key, value] of Object.entries(env)) { const old = Object.keys(result).find(k => k.toLowerCase() === key.toLowerCase()); if (old) delete result[old]; result[key] = value; } return result; }
function expand(input, env = process.env) {
  if (typeof input !== 'string' || input.length > 4096 || /[\0\r\n]/.test(input)) throw Error('올바른 설치 경로를 입력해주세요.');
  const value = input.trim().replace(/^"(.*)"$/, '$1').replace(/^~(?=[/\\]|$)/, os.homedir()).replace(/%([^%]+)%|\$\{([^}]+)\}/g, (s, a, b) => envGet(env, a || b) || s);
  if (!path.isAbsolute(value)) throw Error('실행 파일이나 설치 폴더의 전체 경로를 입력해주세요.');
  return path.normalize(value);
}
async function execute(exe, args, env, timeout = 6000) {
  let command = exe, argv = args;
  if (win && /\.(bat|cmd|ps1)$/i.test(exe)) {
    const invocation = `& ${psQuote(exe)} ${args.map(psQuote).join(' ')}`;
    command = systemPS(); argv = ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(`$ErrorActionPreference='Stop'; ${invocation}; if (-not $?) { exit 1 }; exit $LASTEXITCODE`, 'utf16le').toString('base64')];
  }
  return new Promise(resolve => {
    let output = '', done = false;
    const child = spawn(command, argv, { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const finish = (code, error) => { if (done) return; done = true; clearTimeout(timer); resolve({ code, output: output.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').trim(), error }); };
    const timer = setTimeout(() => { if (win && child.pid) { const killer = spawn(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); killer.on('error', () => child.kill()); } else child.kill(); finish(-1, '실행기가 제한 시간 안에 응답하지 않았습니다.'); }, timeout);
    const data = chunk => { output = (output + chunk.toString()).slice(0, 16000); };
    child.stdout.on('data', data); child.stderr.on('data', data);
    child.on('error', e => finish(-1, e.message)); child.on('close', code => finish(code));
  });
}
async function freshEnvironment() {
  if (!win) return { ...process.env };
  const keys = [...new Set(['Path', ...CATALOG.flatMap(d => d.homes || [])])];
  const script = `$v=@{}; foreach($k in @(${keys.map(psQuote).join(',')})) { $m=[Environment]::GetEnvironmentVariable($k,'Machine'); $u=[Environment]::GetEnvironmentVariable($k,'User'); if($k -eq 'Path') { $v[$k]=($m+';'+$u) } elseif($u) { $v[$k]=$u } elseif($m) { $v[$k]=$m } }; ConvertTo-Json -Compress $v`;
  const result = await execute(systemPS(), ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], process.env);
  try { const current = JSON.parse(result.output); current.Path = [envGet(process.env, 'Path'), current.Path].filter(Boolean).join(';'); return mergeEnv(process.env, current); } catch { return { ...process.env }; }
}
// Only enumerate explicitly known installation locations. Never crawl a user's drive.
async function globFolder(pattern) {
  const parts = path.resolve(pattern).split(path.sep), root = parts.shift() + path.sep;
  let found = [root];
  for (const part of parts) {
    if (!part) continue;
    if (!part.includes('*')) { found = found.map(p => path.join(p, part)); continue; }
    const re = new RegExp('^' + part.split('*').map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$', 'i');
    const next = []; for (const parent of found.slice(0, 32)) try { const entries = await fs.readdir(parent, { withFileTypes: true }); for (const entry of entries) if (entry.isDirectory() && re.test(entry.name)) next.push(path.join(parent, entry.name)); } catch {}
    found = next.slice(0, 32).reverse();
  }
  return found;
}
let pythonHintCache;
async function pythonLocations(env) {
  if(!win)return [];
  const key=envGet(env,'PATH');
  if(pythonHintCache?.key===key&&Date.now()-pythonHintCache.time<10000)return pythonHintCache.promise;
  const promise=(async()=>{
    const script="$p=@(); foreach($r in @('HKCU:\\Software\\Python','HKLM:\\Software\\Python','HKLM:\\Software\\WOW6432Node\\Python')) { Get-ChildItem $r -ErrorAction SilentlyContinue | ForEach-Object { Get-ChildItem $_.PSPath -ErrorAction SilentlyContinue | ForEach-Object { $k=Get-Item ($_.PSPath+'\\InstallPath') -ErrorAction SilentlyContinue; if($k){$e=$k.GetValue('ExecutablePath'); if($e){$p+=$e};$d=$k.GetValue('');if($d){$p+=Join-Path $d 'python.exe'}} } } }; Get-AppxPackage -Name '*Python*' -ErrorAction SilentlyContinue | ForEach-Object { if($_.InstallLocation){$p+=Join-Path $_.InstallLocation 'python.exe'} }; $p | Select-Object -Unique";
    const found=await execute(systemPS(),['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],env);
    const result=found.code===0?found.output.split(/\r?\n/).filter(p=>path.isAbsolute(p)):[];
    for(const dir of envGet(env,'PATH').split(path.delimiter).filter(path.isAbsolute)){const launcher=path.join(dir,'py.exe');if((await fs.stat(launcher).catch(()=>null))?.isFile()){const listed=await execute(launcher,['--list-paths'],env);for(const line of listed.output.split(/\r?\n/)){const match=line.match(/([A-Za-z]:\\.*?python(?:w)?\.exe)\s*$/i);if(match)result.push(match[1]);}break;}}
    return [...new Set(result)];
  })();pythonHintCache={key,time:Date.now(),promise};return promise;
}
async function candidates(def, env, root, input) {
  const entries = [], seen = new Set();
  const add = (file, source) => { if (!path.isAbsolute(file)) return; const key = win ? file.toLowerCase() : file; if (!seen.has(key)) { seen.add(key); entries.push({ path: file, source }); } };
  const names = def.commands.flatMap(n => win && !path.extname(n) ? [n + '.exe', n + '.cmd', n + '.bat', n + '.ps1'] : [n]);
  const folder = (dir, source) => { for (const sub of ['', 'bin', 'Scripts', 'kotlinc/bin', 'cache/dart-sdk/bin']) for (const name of names) add(path.join(dir, sub, name), source); };
  if (input) {
    const full = expand(input, env); const stat = await fs.stat(full).catch(() => null);
    if(def.id==='python' && /[\\/]Microsoft[\\/]WindowsApps[\\/]python(?:3(?:\.\d+)?)?\.exe$/i.test(full)) {
      const hint=await pythonLocations(env);
      for(const file of hint)add(file,'Python 실제 설치 경로');
      if(entries.length)return entries;
      throw Error('이 경로는 Microsoft Store 앱 실행 별칭입니다. 실제 Python이 설치되어 있지 않거나 연결되지 않았습니다. Python 설치를 누르거나 실제 python.exe를 선택해주세요.');
    }
    if (!stat) throw Error('입력한 경로가 존재하지 않습니다.');
    if (stat.isFile()) add(full, 'manual'); else if (stat.isDirectory()) folder(full, 'manual');
    return entries;
  }
  if (def.id === 'python' && root) for (const venv of ['.venv', 'venv']) folder(path.join(root, venv), 'project');
  if(def.id==='python')for(const file of await pythonLocations(env))add(file,'Python 등록 정보');
  for (const home of def.homes || []) if (envGet(env, home)) folder(expand(envGet(env, home), env), home);
  for (const dir of envGet(env, 'PATH').split(path.delimiter).filter(Boolean)) { const clean = dir.replace(/^"|"$/g, ''); if (path.isAbsolute(clean)) for (const name of names) add(path.join(clean, name), 'PATH'); }
  const user = os.homedir(), local = envGet(env, 'LOCALAPPDATA'), programs = [envGet(env, 'ProgramFiles'), envGet(env, 'ProgramFiles(x86)')].filter(Boolean);
  const patterns = [...(def.folders || []).flatMap(p => programs.map(base => path.join(base, p))), ...(def.local || []).map(p => path.join(local || user, p)), ...(def.user || []).map(p => path.join(user, p)), ...(def.extraFolders || [])];
  if(def.id==='kotlin')patterns.unshift(path.join(local||user,'LumaCode/sdks/kotlin/*/kotlinc'));
  const wingetFolders={c:'BrechtSanders.WinLibs*/*/bin',cpp:'BrechtSanders.WinLibs*/*/bin',php:'PHP.PHP*',lua:'DEVCOM.Lua*/bin',scala:'VirtusLab.ScalaCLI*',dart:'Google.DartSDK*/dart-sdk',zig:'zig.zig*/*',elixir:'Elixir.Elixir*'};
  if(wingetFolders[def.id])patterns.push(path.join(local||user,'Microsoft/WinGet/Packages',wingetFolders[def.id]));
  if (def.sdk) patterns.push(path.join(user, '.sdkman/candidates', def.sdk, 'current'), path.join(user, '.sdkman/candidates', def.sdk, '*'));
  patterns.push(path.join(user, 'scoop/apps', def.sdk || def.id, 'current'));
  for (const pattern of patterns) for (const dir of await globFolder(pattern)) folder(dir, 'SDK / 설치 폴더');
  for (const dir of [path.join(user, 'scoop/shims'), local && path.join(local, 'Microsoft/WinGet/Links'), envGet(env, 'ChocolateyInstall') && path.join(envGet(env, 'ChocolateyInstall'), 'bin')].filter(Boolean)) folder(dir, '패키지 관리자');
  for (const file of def.extra || []) add(path.normalize(file), '설치 폴더');
  return entries;
}
async function detect(def, env, root, input) {
  let failure = '';
  for (const item of await candidates(def, env, root, input)) {
    if (!(await fs.stat(item.path).catch(() => null))?.isFile()) continue;
    if(def.id==='python'&&/[\\/]WindowsApps[\\/]python\d*\.exe$/i.test(item.path))continue;
    const result = await execute(item.path, def.versionArgs, env, def.timeout);
    if (result.code === 0 && result.output && (!def.match || def.match.test(result.output))) {
      let actual=item.path;
      if(def.id==='python'){const real=await execute(item.path,['-c','import sys; print(sys.executable)'],env);if(real.code===0&&path.isAbsolute(real.output)&& (await fs.stat(real.output).catch(()=>null))?.isFile())actual=real.output;}
      return { id: def.id, name: def.name, extensions: def.extensions, path: actual, source: item.source, version: result.output.split(/\r?\n/).find(line => !/^warning:/i.test(line))?.slice(0, 250) || result.output.slice(0, 250), valid: true, ready: true, custom: !!def.custom };
    }
    failure = result.error || (result.code !== 0 ? `버전 확인 실패 (종료 코드 ${result.code})` : `${def.name} 실행기로 확인되지 않았습니다.`);
  }
  if(input&&def.id==='python'&&/[\\/]WindowsApps[\\/]python[^\\/]*\.exe$/i.test(input))throw Error('이 경로는 Windows 앱 실행 별칭이며 실제 Python 실행기로 연결되지 않았습니다. Python 설치를 누르거나 실제 python.exe 경로를 선택해주세요.');
  if (input) throw Error(failure || `${def.name} 실행 파일을 찾지 못했습니다. 설치 폴더 또는 실행 파일을 선택해주세요.`);
  return { id: def.id, name: def.name, extensions: def.extensions, path: '', version: '', source: 'auto', valid: false, ready: false, issue: failure || '설치 경로를 찾지 못했습니다.', custom: !!def.custom };
}
function parseArgs(value, fallback) {
  const result = typeof value === 'string' ? JSON.parse(value) : value ?? fallback;
  if (!Array.isArray(result) || result.length > 40 || result.some(s => typeof s !== 'string' || s.length > 4096 || /[\0\r\n]/.test(s))) throw Error('인수는 문자열로 된 JSON 배열을 입력해주세요.');
  return result;
}
function customDefinition(input) {
  if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 60) throw Error('언어 이름을 입력해주세요.');
  const extensions = String(input.extensions).toLowerCase().split(/[,\s]+/).map(s => s.replace(/^\./, '')).filter(Boolean);
  if (!extensions.length || extensions.some(s => !/^[a-z0-9]{1,16}$/.test(s))) throw Error('확장자는 쉼표로 구분해주세요. 예: abc, xyz');
  const args = parseArgs(input.args, ['{file}']), versionArgs = parseArgs(input.versionArgs, ['--version']);
  if (!args.some(s => s.includes('{file}'))) throw Error('실행 인수에 {file}을 포함해주세요.');
  if (!versionArgs.length) throw Error('버전 확인 인수를 입력해주세요.');
  return definition(input.id || 'custom-' + require('node:crypto').randomUUID(), input.name.trim(), [...new Set(extensions)], [], null, { custom: true, args, versionArgs, executable: input.path });
}
function createManager(getPrefs) {
  const cache = new Map(); let environment;
  const invalidate = () => { cache.clear(); environment = undefined; };
  const scan = async (root, refresh = false) => {
    if (refresh) invalidate();
    const key = root || '';
    if (!cache.has(key)) cache.set(key, (async () => {
      const env = await (environment ||= freshEnvironment()), prefs = getPrefs(), custom = (prefs.custom || []).map(c => customDefinition(c));
      const defs = [...CATALOG, ...custom], items = new Array(defs.length); let index = 0;
      // Java launchers are often scripts. Supply a verified JVM before probing them.
      for (const id of ['java', 'javac']) {
        const i = defs.findIndex(d => d.id === id), def = defs[i];
        try { items[i] = await detect(def, env, root, prefs.overrides?.[id]); } catch (e) { items[i] = { id, name: def.name, extensions: def.extensions, path: prefs.overrides[id], version: '', source: 'manual', valid: false, ready: false, issue: e.message }; }
        if (id === 'java' && items[i].valid) {
          const javaBin = path.dirname(items[i].path), merged = mergeEnv(env, { JAVA_HOME: path.dirname(javaBin), Path: javaBin + path.delimiter + envGet(env, 'PATH') });
          Object.keys(env).forEach(k => delete env[k]); Object.assign(env, merged);
        }
      }
      await Promise.all(Array.from({ length: 4 }, async () => { while (index < defs.length) {
        const i = index++, def = defs[i], manual = def.custom ? def.executable : prefs.overrides?.[def.id];
        if (items[i]) continue;
        try { items[i] = await detect(def, env, root, manual); } catch (e) { items[i] = { id: def.id, name: def.name, extensions: def.extensions, path: manual || '', version: '', source: 'manual', valid: false, ready: false, issue: e.message, custom: !!def.custom }; }
      } }));
      const byId = Object.fromEntries(items.map(item => [item.id, item]));
      for (const def of defs) { const item = byId[def.id]; if (!item.valid) continue; const missing = (def.needs || []).filter(id => !byId[id]?.valid); if (missing.length) { item.ready = false; item.issue = `${missing.map(id => byId[id].name).join(', ')} 경로도 확인해주세요.`; } }
      const runnerDirs = [...new Set(items.filter(i => i.valid).map(i => path.dirname(i.path)))];
      const withTools = mergeEnv(env, { Path: [...runnerDirs, envGet(env, 'PATH')].join(path.delimiter) });
      Object.keys(env).forEach(k => delete env[k]); Object.assign(env, withTools);
      return { items, checkedAt: new Date().toISOString(), python: byId.python.ready ? byId.python.path : null, node: byId.node.ready ? byId.node.path : null, powershell: byId.powershell.ready ? byId.powershell.path : null, typescript: byId.node.ready ? 'tsx (내장)' : null, env };
    })().catch(e => { cache.delete(key); throw e; }));
    return cache.get(key);
  };
  const validate = async (id, input, root, custom) => {
    const def = custom ? customDefinition({ ...custom, path: input }) : CATALOG.find(d => d.id === id);
    if (!def) throw Error('등록되지 않은 언어입니다.');
    const env = (await scan(root)).env;
    const result = await detect(def, env, root, input);
    return { result, definition: def };
  };
  return { scan, invalidate, validate };
}
function versionRank(output){return [...String(output).matchAll(/(?<!\d)\d+(?:\.\d+){1,3}(?!\d)/g)].map(m=>m[0]).sort((a,b)=>b.localeCompare(a,undefined,{numeric:true}))[0]||'0';}
async function newest(id, env, root){
  const def=CATALOG.find(d=>d.id===id);if(!def)return null;env ||= await freshEnvironment();const found=[],seen=new Set();
  for(const candidate of await candidates(def,env,root)){
    if((id==='c'||id==='cpp')&&!/g(?:cc|\+\+)(?:\.exe|\.cmd|\.bat)?$/i.test(candidate.path))continue;
    if(!(await fs.stat(candidate.path).catch(()=>null))?.isFile())continue;
    if(id==='python'&&/[\\/]WindowsApps[\\/]/i.test(candidate.path))continue;
    try{const result=await detect(def,env,root,candidate.path);if(seen.has(result.path.toLowerCase()))continue;seen.add(result.path.toLowerCase());const probe=await execute(result.path,def.versionArgs,env,def.timeout);if(probe.code===0)found.push({...result,rank:versionRank(probe.output)});}catch{}
  }
  return found.sort((a,b)=>b.rank.localeCompare(a.rank,undefined,{numeric:true}))[0]||null;
}
module.exports = { CATALOG, createManager, execute, expand, mergeEnv, envGet, parseArgs, customDefinition, detect, systemPS, newest, freshEnvironment, versionRank };
