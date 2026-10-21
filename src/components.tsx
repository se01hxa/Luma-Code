import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, FileCode2, FileJson2, FileText, Folder, FolderOpen, X, LoaderCircle, ImagePlus, Check, Upload, KeyRound, Server, ArrowUpRight } from 'lucide-react';
import type { Entry, Theme, Tab, Profile, Config } from './types';
import { monaco, models, schedulePython } from './editor';
import { revealCode, finishReveal } from './reveal';
import EffectsSettings from './EffectsSettings';
import LanguageIcon from './LanguageIcon';
import PrivacySettings from './PrivacySettings';
import InstallLanguages from './InstallLanguages';
import {usePrivacy,protectedDocument,rememberSecrets,privacyActive} from './privacy';
import RuntimeSettings from './RuntimeSettings';
import { playSound } from './sounds';

export function FileIcon({ path, size = 15 }: { path: string; size?: number }) {
  return <LanguageIcon file={path} size={size}/>;
}
export function Logo({ size = 25 }: { size?: number }) { return <svg width={size} height={size} viewBox="0 0 36 36" fill="none" aria-hidden="true"><path d="M7 7h8v15h14v7H7V7Z" fill="currentColor"/><path d="m22 7 7 7-7 7V7Z" fill="currentColor" opacity=".5"/></svg>; }
export function IconButton({ title, children, onClick, className = '', disabled = false }: { title: string; children: ReactNode; onClick?: () => void; className?: string; disabled?: boolean }) { return <button className={`icon-button ${className}`} title={title} aria-label={title} onClick={onClick} disabled={disabled}>{children}</button>; }
export function Spinner({ label = '불러오는 중…' }: { label?: string }) { return <div className="loading"><LoaderCircle className="spin" size={18}/><span>{label}</span></div>; }
export function Modal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement;
    const focusable = () => Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, select, textarea, [tabindex="0"]') || []);
    focusable().find(el => el.tagName === 'INPUT')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      if (e.key === 'Tab') { const items = focusable(), first = items[0], last = items.at(-1); if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); } }
    };
    document.addEventListener('keydown', onKey); return () => { document.removeEventListener('keydown', onKey); prev?.focus(); };
  }, []);
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}><div className="modal-heading"><h2>{title}</h2><IconButton title="닫기" onClick={onClose}><X size={17}/></IconButton></div>{children}</div></div>;
}

export function FileTree({ tree, active, onOpen, onContext, openDirs, toggleDir, depth = 0 }: { tree: Entry[]; active: string; onOpen: (path: string) => void; onContext: (entry: Entry, x: number, y: number) => void; openDirs: Set<string>; toggleDir: (path: string) => void; depth?: number }) {
  return <>{tree.map(entry => <div key={entry.path}>
    <button className={`tree-row ${active === entry.path ? 'selected' : ''}`} style={{ paddingLeft: 12 + depth * 14 }} onClick={() => entry.kind === 'file' ? onOpen(entry.path) : toggleDir(entry.path)} onContextMenu={e => { e.preventDefault(); onContext(entry, e.clientX, e.clientY); }} title={entry.path}>
      {entry.kind === 'directory' ? <>{openDirs.has(entry.path) ? <ChevronDown size={13}/> : <ChevronRight size={13}/>} {openDirs.has(entry.path) ? <FolderOpen size={15} className="folder-icon"/> : <Folder size={15} className="folder-icon"/>}</> : <><span className="tree-spacer"/><FileIcon path={entry.path}/></>}
      <span>{entry.name}</span>{entry.inaccessible && <span className="muted">!</span>}
    </button>{entry.kind === 'directory' && openDirs.has(entry.path) && <FileTree {...{ active, onOpen, onContext, openDirs, toggleDir }} tree={entry.children || []} depth={depth + 1}/>}</div>)}</>;
}

export function EditorView({ active, theme, onChange, onPosition, onProblems, editorRef }: { active?: Tab; theme: Theme; onChange: (path: string, value: string) => void; onPosition: (line: number, column: number) => void; onProblems: (problems: monaco.editor.IMarker[]) => void; editorRef: { current: monaco.editor.IStandaloneCodeEditor | null } }) {
  const container = useRef<HTMLDivElement>(null), callbacks = useRef({ onChange, onPosition, onProblems }), views = useRef(new Map<string, monaco.editor.ICodeEditorViewState>());
  const seen = useRef(new Set<string>()), previews = useRef(new Map<string,monaco.editor.ITextModel>());
  const privacy=usePrivacy();
  const [protectedCount,setProtectedCount]=useState(0);
  callbacks.current = { onChange, onPosition, onProblems };
  useLayoutEffect(() => {
    const editor = monaco.editor.create(container.current!, { theme: 'luma', automaticLayout: true, editContext: false, fontFamily: '"Cascadia Code", "Consolas", monospace', fontSize: theme.fontSize, lineHeight: 24, padding: { top: 20, bottom: 30 }, minimap: { enabled: theme.minimap }, scrollBeyondLastLine: false, smoothScrolling: true, cursorBlinking: 'smooth', cursorSmoothCaretAnimation: 'on', renderLineHighlight: 'all', bracketPairColorization: { enabled: true }, guides: { bracketPairs: true }, stickyScroll: { enabled: true }, wordBasedSuggestions: 'allDocuments', suggest: { showWords: true, preview: false }, inlineSuggest: { enabled: false }, quickSuggestions: { other: true, comments: false, strings: true }, tabSize: theme.tabSize, insertSpaces: true, model: null, overviewRulerBorder: false, renderWhitespace: 'selection', links: false, unicodeHighlight: { ambiguousCharacters: false, invisibleCharacters: false } });
    editorRef.current = editor;
    const change = editor.onDidChangeModelContent(() => { const model = editor.getModel(); if (!model) return; const path = [...models].find(([, m]) => m === model)?.[0]; if (path) { callbacks.current.onChange(path, model.getValue());rememberSecrets(path,model.getValue());const masked=privacyActive()?protectedDocument(path,model.getValue()):null;if(masked?.count){let preview=previews.current.get(path);if(!preview){preview=monaco.editor.createModel(masked.content,model.getLanguageId(),monaco.Uri.parse('inmemory://protected/'+encodeURIComponent(path)));previews.current.set(path,preview);}else preview.setValue(masked.content);editor.updateOptions({readOnly:true,contextmenu:false});editor.setModel(preview);setProtectedCount(masked.count);} } });
    const position = editor.onDidChangeCursorPosition(e => callbacks.current.onPosition(e.position.lineNumber, e.position.column));
    const markers = monaco.editor.onDidChangeMarkers(() => callbacks.current.onProblems(monaco.editor.getModelMarkers({}).filter(m => [...models.values()].some(model => model.uri.toString() === m.resource.toString()))));
    return () => { finishReveal(); change.dispose(); position.dispose(); markers.dispose(); editor.dispose(); previews.current.forEach(m=>m.dispose()); editorRef.current = null; };
  }, []);
  useLayoutEffect(() => {
    const editor = editorRef.current; if (!editor) return;
    finishReveal();
    const old = editor.getModel(), state = editor.saveViewState();
    if (old && state) views.current.set(old.uri.toString(), state);
    let model = active ? models.get(active.path) || null : null;
    const masked=privacy.active&&model&&active?protectedDocument(active.path,model.getValue()):null;
    setProtectedCount(masked?.count || 0);
    editor.updateOptions({readOnly:!!masked?.count,hover:{enabled:privacy.active?'off':'on'},wordBasedSuggestions:privacy.active?'currentDocument':'allDocuments',minimap:{enabled:theme.minimap},contextmenu:!masked?.count});
    if(model&&masked?.count){let preview=previews.current.get(active!.path);if(!preview){preview=monaco.editor.createModel(masked.content,model.getLanguageId(),monaco.Uri.parse('inmemory://protected/'+encodeURIComponent(active!.path)));previews.current.set(active!.path,preview);}else if(preview.getValue()!==masked.content)preview.setValue(masked.content);model=preview;}

    editor.setModel(model);
    if (model) {
      editor.restoreViewState(views.current.get(model.uri.toString()) || null); editor.focus(); schedulePython(model);
      const key = model.uri.toString();
      if (!seen.current.has(key)) { seen.current.add(key); return revealCode(editor, container.current!, theme); }
    }
  }, [active?.path,privacy.active]);
  useEffect(() => { editorRef.current?.updateOptions({ fontSize: theme.fontSize, fontFamily: `"${theme.fontFamily.replace(/["\\]/g, '')}", "Consolas", monospace`, minimap: { enabled: theme.minimap }, wordWrap: theme.wordWrap ? 'on' : 'off', tabSize: theme.tabSize, lineHeight: Math.round(theme.fontSize * 1.72) }); for (const model of models.values()) model.updateOptions({ tabSize: theme.tabSize, insertSpaces: true }); }, [theme.fontSize, theme.fontFamily, theme.minimap, theme.wordWrap, theme.tabSize]);
  return <><div className="privacy-editor-notice" hidden={!protectedCount}>토큰 {protectedCount}개 보호 중 · 읽기 전용 미리보기 · 원본 저장·실행 유지</div><div className="monaco-host" ref={container} style={{ visibility: active ? 'visible' : 'hidden' }}/ ></>;
}

export const PRESETS = [
  { id: 'midnight', name: 'Midnight', sub: '차분한 기본 테마', bg: '#15171c', accent: '#7dd3bc', preview: ['#1e222b', '#c4a0e8', '#b5cea8'] },
  { id: 'graphite', name: 'Graphite', sub: '깊고 선명한 무채색', bg: '#141414', accent: '#a8b4f7', preview: ['#262626', '#a8b4f7', '#c9c6b4'] },
  { id: 'ocean', name: 'Deep Ocean', sub: '푸른 밤의 작업 공간', bg: '#0e1b26', accent: '#79c4ec', preview: ['#182d3a', '#c3a5e8', '#8bc8b9'] },
  { id: 'paper', name: 'Paper', sub: '밝고 편안한 화면', bg: '#f5f5f0', accent: '#287d69', preview: ['#e5e8e1', '#885ca7', '#5e8568'] },
];
export function Settings({ theme, update, error }: { theme: Theme; update: (theme: Partial<Theme>) => void; error: (e: unknown) => void }) {
  const [section, setSection] = useState('appearance');
  return <div className="settings-page"><nav className="settings-nav"><span className="eyebrow">PREFERENCES</span><h1>나의 작업 공간</h1><button className={section === 'appearance' ? 'active' : ''} onClick={() => setSection('appearance')}>모양과 배경</button><button className={section === 'editor' ? 'active' : ''} onClick={() => setSection('editor')}>편집기 설정</button><button className={section === 'effects' ? 'active' : ''} onClick={() => setSection('effects')}>효과와 소리</button><button className={section === 'runtimes' ? 'active' : ''} onClick={() => setSection('runtimes')}>언어와 실행기</button><button className={section === 'privacy' ? 'active' : ''} onClick={() => setSection('privacy')}>토큰 보호</button><button className={section === 'install' ? 'active' : ''} onClick={() => setSection('install')}>언어 설치</button><div className="settings-note"><Check size={14}/> 변경 사항은 자동 저장됩니다.</div></nav><div className="settings-content">
    {section === 'appearance' ? <><span className="eyebrow">MAKE IT YOURS</span><h2>집중하기 좋은 분위기.</h2><p className="description">색상부터 움직이는 배경까지, 나에게 맞게 설정하세요.</p>
      <h3>컬러 테마</h3><div className="preset-grid">{PRESETS.map(p => <button key={p.id} className={`preset ${theme.preset === p.id ? 'chosen' : ''}`} onClick={() => update({ preset: p.id, background: p.bg, accent: p.accent })}><div className="preset-preview" style={{ background: p.bg }}><div style={{ background: p.preview[0] }}/><section><i style={{ width: '55%', background: p.preview[1] }}/><i style={{ width: '80%', background: p.accent }}/><i style={{ width: '65%', background: p.preview[2] }}/></section>{theme.preset === p.id && <Check size={15} style={{ color: p.accent }}/>}</div><b>{p.name}</b><span>{p.sub}</span></button>)}</div>
      <div className="setting-row"><div><b>강조 색상</b><p>버튼과 선택 영역에 사용할 색상</p></div><label className="color-field"><input type="color" value={theme.accent} onChange={e => update({ accent: e.target.value })}/><code>{theme.accent.toUpperCase()}</code></label></div>
      <div className="setting-row"><div><b>배경 색상</b><p>편집기 전체의 기본 배경</p></div><label className="color-field"><input type="color" value={theme.background} onChange={e => update({ background: e.target.value })}/><code>{theme.background.toUpperCase()}</code></label></div>
      <h3>배경 이미지</h3><button className={`image-upload ${theme.image ? 'has-image' : ''}`} style={theme.image ? { backgroundImage: `url("${theme.image}")` } : {}} onClick={async () => { try { const image = await window.luma.chooseImage(); if (image) update({ image }); } catch (e) { error(e); } }}><div><ImagePlus size={25}/><b>{theme.image ? '다른 이미지 선택' : '이미지 또는 GIF 선택'}</b><span>PNG, JPG, WebP, GIF · 최대 12 MB</span></div></button>
      {theme.image && <button className="text-button" onClick={() => update({ image: '' })}><X size={13}/> 배경 이미지 제거</button>}
      <div className="setting-row"><div><b>배경 덮개</b><p>값을 높이면 코드가 더 또렷해집니다.</p></div><input aria-label="배경 덮개" type="range" min="35" max="100" value={theme.opacity} onChange={e => update({ opacity: +e.target.value })}/><code className="range-value">{theme.opacity}%</code></div>
      <div className="setting-row"><div><b>이미지 흐림</b><p>배경에 부드러운 흐림 효과 적용</p></div><input aria-label="이미지 흐림" type="range" min="0" max="20" value={theme.blur} onChange={e => update({ blur: +e.target.value })}/><code className="range-value">{theme.blur}px</code></div>
    </> : section === 'install' ? <InstallLanguages/> : section === 'privacy' ? <PrivacySettings/> : section === 'runtimes' ? <RuntimeSettings/> : section === 'effects' ? <EffectsSettings theme={theme} update={update}/> : <><span className="eyebrow">EDITOR</span><h2>손에 익는 편집기.</h2><p className="description">코드를 읽고 작성하는 방식을 조정하세요.</p>
      <div className="setting-row"><div><b>글꼴</b><p>컴퓨터에 설치된 고정폭 글꼴</p></div><select value={theme.fontFamily} onChange={e => update({ fontFamily: e.target.value })}>{['Cascadia Code', 'Consolas', 'D2Coding', 'JetBrains Mono', 'Fira Code', 'monospace'].map(s => <option key={s}>{s}</option>)}</select></div>
      <div className="setting-row"><div><b>글꼴 크기</b><p>코드와 줄 번호의 크기</p></div><input type="number" aria-label="글꼴 크기" min="10" max="28" value={theme.fontSize} onChange={e => { const n = +e.target.value; if (n >= 10 && n <= 28) update({ fontSize: n }); }}/><span className="muted">px</span></div>
      <div className="setting-row"><div><b>들여쓰기</b><p>Tab 키의 공백 수</p></div><select value={theme.tabSize} onChange={e => update({ tabSize: +e.target.value })}>{[2, 4, 8].map(n => <option key={n} value={n}>{n}칸</option>)}</select></div>
      {([['minimap', '미니맵', '오른쪽에 코드 축소 보기 표시'], ['wordWrap', '자동 줄 바꿈', '긴 줄을 화면 너비에 맞춰 표시'], ['autoSave', '자동 저장', '입력을 멈춘 뒤 1초 후 파일 저장']] as const).map(([key, name, detail]) => <div className="setting-row" key={key}><div><b>{name}</b><p>{detail}</p></div><button className={`toggle ${theme[key] ? 'on' : ''}`} role="switch" aria-checked={theme[key]} aria-label={name} onClick={() => update({ [key]: !theme[key] })}><span/></button></div>)}
      <div className="info-box">JavaScript · TypeScript는 Monaco IntelliSense, 로컬 Python은 Pyright를 사용합니다. PowerShell은 명령어와 스니펫을 제안합니다.</div>
    </>}
  </div></div>;
}

export function SSHDialog({ profiles, onConnect, onClose }: { profiles: Config['profiles']; onConnect: (p: Profile) => Promise<void>; onClose: () => void }) {
  const [profile, setProfile] = useState<Profile>({ host: '', port: 22, username: '', folder: '.', keyPath: '' });
  const [auth, setAuth] = useState('password'), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const field = (key: keyof Profile, value: string | number) => setProfile(p => ({ ...p, [key]: value }));
  return <Modal title="SSH 원격 연결" onClose={() => { if (!busy) onClose(); }}><form onSubmit={async e => { e.preventDefault(); setBusy(true); setError(''); try { await onConnect({ ...profile, keyPath: auth === 'key' ? profile.keyPath : '', password: auth === 'password' ? profile.password : '' }); } catch (e) { setError((e as Error).message); void playSound('error'); } finally { setBusy(false); } }}>
    <div className="ssh-intro"><span className="ssh-symbol"><Server size={23}/></span><div><b>서버에서도 같은 작업 공간.</b><p>원격 파일을 편집하고 터미널에서 바로 실행하세요.</p></div></div>
    {profiles.length > 0 && <label className="form-field">저장된 연결<select defaultValue="" onChange={e => { const p = profiles[+e.target.value]; if (p) { setProfile({ ...p, password: '', passphrase: '' }); setAuth(p.keyPath ? 'key' : 'password'); } }}><option value="" disabled>연결 설정 불러오기</option>{profiles.map((p, i) => <option key={i} value={i}>{p.username}@{p.host}:{p.port}</option>)}</select></label>}
    <div className="form-grid"><label className="form-field">호스트<input required placeholder="192.168.0.10" value={profile.host} onChange={e => field('host', e.target.value)} disabled={busy}/></label><label className="form-field short">포트<input type="number" min="1" max="65535" required value={profile.port} onChange={e => field('port', +e.target.value)} disabled={busy}/></label></div>
    <label className="form-field">사용자 이름<input required placeholder="사용자 이름" autoComplete="off" value={profile.username} onChange={e => field('username', e.target.value)} disabled={busy}/></label>
    <label className="form-field">원격 폴더<input required placeholder="/home/user/project" value={profile.folder} onChange={e => field('folder', e.target.value)} disabled={busy}/></label>
    <div className="segmented"><button type="button" className={auth === 'password' ? 'active' : ''} onClick={() => setAuth('password')} disabled={busy}>비밀번호</button><button type="button" className={auth === 'key' ? 'active' : ''} onClick={() => setAuth('key')} disabled={busy}>SSH 개인 키</button></div>
    {auth === 'password' ? <label className="form-field">비밀번호<input type="password" autoComplete="off" value={profile.password || ''} onChange={e => field('password', e.target.value)} disabled={busy}/></label> : <><label className="form-field">개인 키 파일<div className="input-action"><input required readOnly value={profile.keyPath} placeholder="키 파일 선택"/><button type="button" title="키 파일 선택" disabled={busy} onClick={async () => { const key = await window.luma.chooseKey(); if (key) field('keyPath', key); }}><KeyRound size={16}/></button></div></label><label className="form-field">키 암호 <span className="muted">선택 사항</span><input type="password" autoComplete="off" value={profile.passphrase || ''} onChange={e => field('passphrase', e.target.value)} disabled={busy}/></label></>}
    <p className="form-note">비밀번호와 키 암호는 저장하지 않습니다. 처음 연결할 때 서버 지문을 확인합니다. Linux / macOS SSH 서버를 지원합니다.</p>
    {error && <div className="form-error" role="alert">{error}</div>}
    <div className="modal-footer"><button type="button" className="button secondary" onClick={onClose} disabled={busy}>취소</button><button className="button primary" disabled={busy}>{busy ? <LoaderCircle size={15} className="spin"/> : <ArrowUpRight size={16}/>} {busy ? '연결 중…' : '연결하기'}</button></div>
  </form></Modal>;
}


