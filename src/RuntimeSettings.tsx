import { useEffect, useState } from 'react';
import { Check, ChevronDown, ChevronRight, FolderOpen, LoaderCircle, Plus, RefreshCw, Search, TerminalSquare, Trash2 } from 'lucide-react';
import LanguageIcon from './LanguageIcon';
import {InstallButton,InstallProgress} from './InstallLanguages';
import type { Runtime, RuntimeItem } from './types';

const message = (e: unknown) => String(e instanceof Error ? e.message : e).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '');
export default function RuntimeSettings() {
  const [report, setReport] = useState<Runtime>(), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [query, setQuery] = useState(''), [filter, setFilter] = useState('all'), [custom, setCustom] = useState(false);
  const refresh = async (force = false) => { setBusy(true); setError(''); try { setReport(await window.luma.runtimes(force)); } catch (e) { setError(message(e)); } finally { setBusy(false); } };
  useEffect(() => { void refresh(); }, []);
  const items = report?.items || [], ready = items.filter(r => r.ready).length;
  const visible = items.filter(r => `${r.name} ${r.extensions.join(' ')} ${r.path}`.toLowerCase().includes(query.toLowerCase()) && (filter === 'all' || (filter === 'ready' ? r.ready : !r.ready)));
  return <div className="runtime-settings">
    <span className="eyebrow">LANGUAGES & RUNTIMES</span><h2>언어가 준비되면, 바로 실행.</h2>
    <p className="description">설치된 실행기를 자동으로 찾고 버전을 검사합니다. 경로를 직접 지정할 수도 있습니다.</p>
    <div className="runtime-summary"><div className="runtime-summary-icon"><TerminalSquare size={25}/></div><div><b>{report ? `${ready}개 실행 준비 완료` : '설치된 언어 확인 중…'}</b><span>PATH · 설치 폴더 · 가상 환경 · SDK 관리 경로</span></div><button className="button secondary" disabled={busy} onClick={() => refresh(true)}><RefreshCw size={14} className={busy ? 'spin' : ''}/>{busy ? '검사 중…' : '다시 자동 확인'}</button></div>
    {report?.remote && <p className="runtime-notice">현재 SSH 작업 공간입니다. 이 설정은 내 컴퓨터에 적용됩니다. 원격 파일은 서버에 설치된 실행기를 사용합니다.</p>}
    <div className="runtime-toolbar"><label className="runtime-search"><Search size={14}/><input aria-label="언어 검색" placeholder="언어 또는 확장자 검색…" value={query} onChange={e => setQuery(e.target.value)}/></label><select aria-label="실행기 표시" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">전체 언어</option><option value="ready">준비 완료</option><option value="missing">확인 필요</option></select></div>
    {error && <p className="runtime-error" role="alert">{error}</p>}
    {!report && busy ? <div className="loading"><LoaderCircle size={17} className="spin"/>실행기를 검사하고 있습니다…</div> : <div className="runtime-list">{visible.map(item => <RuntimeRow key={item.id + item.path} item={item} disabled={busy} onUpdate={setReport}/>)}{report && !visible.length && <p className="runtime-empty">일치하는 언어가 없습니다. 아래에서 사용자 실행기를 등록할 수 있습니다.</p>}</div>}
    <InstallProgress onFinish={()=>void refresh()}/><div className="runtime-add-heading"><div><h3>목록에 없는 언어도 연결하세요.</h3><p>설치된 실행 파일과 확장자를 등록하면 F5로 실행할 수 있습니다.</p></div><button className="button secondary" onClick={() => setCustom(v => !v)}><Plus size={14}/>실행기 추가</button></div>
    {custom && <CustomForm onSave={r => { setReport(r); setCustom(false); }}/>} 
    <p className="runtime-footnote">자동 확인은 일반적인 설치 위치를 검사합니다. 찾지 못한 언어는 직접 경로를 지정해주세요. 실행 파일은 버전 확인에 성공한 뒤 저장됩니다. C, C++, Java, Kotlin 등은 현재 파일을 컴파일해 실행합니다. 여러 파일의 빌드 설정은 터미널에서 프로젝트 명령을 사용하세요.</p>
    {report?.checkedAt && <p className="runtime-timestamp">최근 확인 · {new Date(report.checkedAt).toLocaleString('ko-KR')}</p>}
  </div>;
}
function RuntimeRow({ item, disabled, onUpdate }: { item: RuntimeItem; disabled: boolean; onUpdate: (r: Runtime) => void }) {
  const [open, setOpen] = useState(false), [input, setInput] = useState(item.path), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const save = async () => { setBusy(true); setError(''); try { onUpdate(await window.luma.saveRuntime({ id: item.id, path: input })); setOpen(false); } catch (e) { setError(message(e)); } finally { setBusy(false); } };
  const reset = async () => { setBusy(true); setError(''); try { onUpdate(await window.luma.resetRuntime(item.id)); } catch (e) { setError(message(e)); } finally { setBusy(false); } };
  const pick = async (folder: boolean) => { try { const p = await window.luma.chooseRuntime(folder); if (p) setInput(p); } catch (e) { setError(message(e)); } };
  return <section className={`runtime-row ${open ? 'expanded' : ''}`} data-runtime={item.id}>
    <button className="runtime-row-heading" aria-expanded={open} onClick={() => setOpen(v => !v)}><span className={`runtime-indicator ${item.ready ? 'ready' : item.valid ? 'partial' : ''}`}><LanguageIcon id={item.id} size={25}/></span><span className="runtime-name"><b>{item.name}</b><small>{item.extensions.length ? item.extensions.map(e => '.' + e).join('  ') : '보조 실행기'}</small></span><span className={`runtime-status ${item.ready ? 'ready' : ''}`}>{item.ready ? '준비 완료' : item.valid ? '추가 설정 필요' : '확인 필요'}{item.source === 'manual' && <small>직접 지정</small>}{item.custom && <small>사용자 등록</small>}</span>{open ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}</button>
    {open && <div className="runtime-detail">
      <InstallButton item={item} disabled={disabled||busy} onError={setError}/><p className="runtime-help">설치·업데이트 버튼은 배포처 및 WinGet 설치 약관에 동의한 뒤 실행합니다. Kotlin은 Java도 함께 설치합니다.</p>
      {item.version && <p className="runtime-version">{item.version}</p>}{item.issue && <p className="runtime-notice">{item.issue}</p>}
      {item.id === 'kotlin' && <p className="runtime-help">Kotlin은 kotlinc와 Java가 필요합니다. kotlinc.bat 또는 Kotlin 설치 폴더를 지정해주세요.</p>}
      {item.custom ? <><code className="runtime-path">{item.path}</code><p className="runtime-help">설정을 변경하려면 삭제한 뒤 실행기를 다시 등록해주세요.</p><button className="text-button" onClick={reset} disabled={busy || disabled}><Trash2 size={13}/>등록 삭제</button></> : <>
        <label className="runtime-label">실행 파일 또는 설치 폴더<input aria-label={`${item.name} 경로`} placeholder="예: C:\Tools\kotlin\bin\kotlinc.bat" value={input} onChange={e => setInput(e.target.value)}/></label>
        <div className="runtime-actions"><button className="button secondary" onClick={() => pick(false)} disabled={busy}><FolderOpen size={13}/>파일 찾기</button><button className="button secondary" onClick={() => pick(true)} disabled={busy}>폴더 찾기</button><span/><button className="text-button" disabled={busy || disabled || item.source !== 'manual'} onClick={reset}>자동 감지로 복원</button><button className="button primary" disabled={busy || disabled || !input.trim()} onClick={save}>{busy && <LoaderCircle size={13} className="spin"/>}검사 후 저장</button></div>
        {item.path && <p className="runtime-origin">현재 경로 · {item.source === 'manual' ? '직접 지정' : item.source}<code>{item.path}</code></p>}
      </>}{error && <p className="runtime-error" role="alert">{error}</p>}
    </div>}
  </section>;
}
function CustomForm({ onSave }: { onSave: (r: Runtime) => void }) {
  const [name, setName] = useState(''), [extensions, setExtensions] = useState(''), [path, setPath] = useState(''), [args, setArgs] = useState('["{file}"]'), [versionArgs, setVersionArgs] = useState('["--version"]'), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const save = async () => { setBusy(true); setError(''); try { onSave(await window.luma.saveRuntime({ path, custom: { name, extensions, args, versionArgs } })); } catch (e) { setError(message(e)); } finally { setBusy(false); } };
  return <div className="runtime-custom"><h3>사용자 실행기</h3><div className="runtime-custom-grid"><label className="runtime-label">언어 이름<input aria-label="사용자 언어 이름" value={name} onChange={e => setName(e.target.value)} placeholder="예: My Language"/></label><label className="runtime-label">파일 확장자<input aria-label="사용자 언어 확장자" value={extensions} onChange={e => setExtensions(e.target.value)} placeholder="예: abc, xyz"/></label></div><label className="runtime-label">실행 파일 경로<div className="runtime-input-row"><input aria-label="사용자 실행 파일 경로" value={path} onChange={e => setPath(e.target.value)}/><button className="button secondary" onClick={async () => { try { const p = await window.luma.chooseRuntime(); if (p) setPath(p); } catch (e) { setError(message(e)); } }}>찾기</button></div></label><label className="runtime-label">실행 인수 (JSON 배열)<input aria-label="실행 인수" value={args} onChange={e => setArgs(e.target.value)}/></label><p className="runtime-help">{'{file}'}은 현재 파일, {'{dir}'}은 파일 폴더, {'{name}'}은 확장자를 뺀 파일 이름입니다. 예: ["run", "{'{file}'}"]</p><label className="runtime-label">버전 확인 인수 (JSON 배열)<input aria-label="버전 확인 인수" value={versionArgs} onChange={e => setVersionArgs(e.target.value)}/></label><p className="runtime-help">버전 확인 명령이 성공하고 결과를 출력해야 등록됩니다. 같은 확장자의 기본 실행기보다 사용자 실행기가 우선합니다.</p>{error && <p className="runtime-error" role="alert">{error}</p>}<button className="button primary" disabled={busy || !name || !extensions || !path} onClick={save}>{busy ? <LoaderCircle className="spin" size={14}/> : <Check size={14}/>}검사 후 등록</button></div>;
}
