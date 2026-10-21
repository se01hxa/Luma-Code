const fs = require('node:fs/promises');
const path = require('node:path');
const { CATALOG, customDefinition, execute, mergeEnv, envGet } = require('./runtimes.cjs');
const { psQuote } = require('./core.cjs');
const unpacked = p => p.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
async function buildPlan(full, report, prefs, tempRoot) {
  const ext = path.extname(full).slice(1).toLowerCase();
  const custom = (prefs.custom || []).map(customDefinition).find(d => d.extensions.includes(ext));
  const def = custom || CATALOG.find(d => d.extensions.includes(ext));
  if (!def) throw Error(`.${ext} 실행기를 설정 → 언어와 실행기에서 등록해주세요.`);
  const get = id => { const item = report.items.find(r => r.id === id); if (!item?.valid) throw Error(`${item?.name || id} 실행 경로를 설정 → 언어와 실행기에서 확인해주세요.`); return item.path; };
  const item = report.items.find(r => r.id === def.id);
  if (!item?.ready) throw Error(`${def.name}: ${item?.issue || '실행 경로를 확인해주세요.'} 설정 → 언어와 실행기에서 변경할 수 있습니다.`);
  // Check again at execution time: an uninstalled or replaced runner must not use a stale scan.
  const probe = await execute(get(def.id), def.versionArgs, report.env, def.timeout);
  if (probe.code !== 0 || !probe.output || (def.match && !def.match.test(probe.output))) throw Error(`${def.name} 실행 경로가 더 이상 유효하지 않습니다. 언어와 실행기에서 다시 검사해주세요.`);
  const steps = [], env = mergeEnv(report.env, { PYTHONIOENCODING: 'utf-8', PYTHONUNBUFFERED: '1', DOTNET_NOLOGO: '1', DOTNET_CLI_TELEMETRY_OPTOUT: '1' });
  let dir;
  const temporary = async () => { await fs.mkdir(tempRoot, { recursive: true }); return dir ||= await fs.mkdtemp(path.join(tempRoot, 'run-')); };
  const step = (id, args) => steps.push({ exe: get(id), args });
  try {
    if (custom) { const values = { file: full, dir: path.dirname(full), name: path.basename(full, path.extname(full)) }; step(def.id, custom.args.map(s => s.replace(/\{(file|dir|name)\}/g, (_, k) => values[k]))); }
    else switch (def.id) {
      case 'python': step('python', ['-u', full]); break;
      case 'node': step('node', /^(ts|tsx|mts|cts)$/.test(ext) ? [unpacked(require.resolve('tsx/cli')), full] : [full]); break;
      case 'powershell': step('powershell', ['-NoProfile', '-File', full]); break;
      case 'kotlin': {
        get('java');
        const homes = [path.resolve(path.dirname(get('kotlin')), '..'), envGet(report.env, 'KOTLIN_HOME')].filter(Boolean);
        let kotlinHome;
        for (const home of homes) if ((await fs.stat(path.join(home, 'lib/kotlin-compiler.jar')).catch(() => null))?.isFile()) { kotlinHome = home; break; }
        // The official Windows batch launcher expands %~1 in an unquoted SET.
        // Invoke its JVM compiler directly so legal filenames containing & or ! survive.
        const compiler = args => kotlinHome ? step('java', ['-Xmx512m', '-Dkotlin.home=' + kotlinHome, '-cp', path.join(kotlinHome, 'lib', '*'), 'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler', ...args]) : step('kotlin', args);
        if (ext === 'kts') compiler(['-script', full]);
        else { const jar = path.join(await temporary(), 'program.jar'); compiler([full, '-include-runtime', '-d', jar]); step('java', ['-jar', jar]); }
        break;
      }
      case 'java': {
        const out = await temporary(), source = await fs.readFile(full, 'utf8');
        const stripped = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
        const pkg = stripped.match(/^\s*package\s+([\w.]+)\s*;/m)?.[1];
        step('javac', ['-encoding', 'UTF-8', '-d', out, full]); step('java', ['-cp', out, (pkg ? pkg + '.' : '') + path.basename(full, '.java')]); break;
      }
      case 'c': case 'cpp': { const out = path.join(await temporary(), process.platform === 'win32' ? 'program.exe' : 'program'); step(def.id, [full, '-o', out]); steps.push({ exe: out, args: [] }); break; }
      case 'rust': { const out = path.join(await temporary(), process.platform === 'win32' ? 'program.exe' : 'program'); step('rust', [full, '--crate-name', 'luma_run', '-o', out]); steps.push({ exe: out, args: [] }); break; }
      case 'go': step('go', ['run', full]); break;
      case 'dotnet': {
        if (ext === 'fsx') { step('dotnet', ['fsi', full]); break; }
        const sdk = [...probe.output.matchAll(/^(\d+)\.\d+\.\d+/gm)].map(m=>Number(m[1])).sort((a,b)=>b-a)[0]; if (!sdk) throw Error('.NET SDK 버전을 확인할 수 없습니다.');
        const escape = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const project = path.join(await temporary(), 'LumaRun.csproj');
        await fs.writeFile(project, `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net${sdk}.0</TargetFramework><ImplicitUsings>enable</ImplicitUsings><EnableDefaultCompileItems>false</EnableDefaultCompileItems></PropertyGroup><ItemGroup><Compile Include="${escape(full)}" /></ItemGroup></Project>`);
        step('dotnet', ['run', '--project', project, '--no-launch-profile']); break;
      }
      case 'dart': step('dart', ['run', full]); break;
      case 'nim': step('nim', ['c', '-r', '--out:' + path.join(await temporary(), 'program' + (process.platform === 'win32' ? '.exe' : '')), '--nimcache:' + path.join(dir, 'cache'), full]); break;
      case 'zig': step('zig', ['run', full, '--cache-dir', await temporary()]); break;
      default: step(def.id, [full]);
    }
    return { steps, env, cleanup: dir, language: def.name };
  } catch (e) { if (dir) await fs.rm(dir, { recursive: true, force: true }); throw e; }
}
function powershellCommand(steps) {
  // Native executable paths and every argument are passed as literal strings.
  return "$ErrorActionPreference='Stop'; try { " + steps.map(s => `& ${psQuote(s.exe)} ${s.args.map(psQuote).join(' ')}; if (-not $?) { if ($LASTEXITCODE) { exit $LASTEXITCODE }; exit 1 }; if ($LASTEXITCODE) { exit $LASTEXITCODE };`).join(' ') + " exit 0 } catch { Write-Error $_; exit 1 }";
}
module.exports = { buildPlan, powershellCommand };
