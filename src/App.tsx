import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles, Files, Search, Network, Settings2, TerminalSquare, FolderOpen, Plus, X, ChevronRight, ChevronDown, Minus, Square, Play, PanelBottom, PanelLeftClose, RefreshCw, FilePlus2, FolderPlus, ChevronsDownUp, Save, Circle, GitBranch, Radio, Check, TriangleAlert, CircleX, Bell, Command, ArrowRight, ArrowUpRight, Monitor, Server, Palette, Keyboard, ExternalLink, Trash2, CaseSensitive, ListTree, MoreHorizontal, PanelLeft, LoaderCircle, CircleHelp } from 'lucide-react';
import type { Config, Entry, Workspace, Theme, Tab, Match, TerminalInfo, Runtime, Profile } from './types';
import { EditorView, FileIcon, FileTree, IconButton, Logo, Modal, Settings, SSHDialog, Spinner } from './components';
import { monaco, models, ensureModel, resetModels, seedModels, defineTheme, schedulePython } from './editor';
import ProjectMap from './ProjectMap';
import TerminalPanel, { clearTerminal, forgetTerminal } from './TerminalPanel';
import { configureSounds, installButtonSounds, playSound } from './sounds';
import { finishReveal } from './reveal';
import {privateText,usePrivacy} from './privacy';
import {presenceMetadata} from './presence';
import AIPanel from './AIPanel';
import './ai.css';

const DEFAULT_THEME: Theme = { preset: 'midnight', accent: '#7dd3bc', background: '#15171c', image: '', opacity: 88, blur: 0, fontSize: 14, fontFamily: 'Cascadia Code', minimap: false, wordWrap: false, tabSize: 2, autoSave: false, openAnimation: true, animationDuration: 1100, soundEnabled: true, soundVolume: 35, clickSound: 'tock', typingSound: true };
const flatten = (entries: Entry[]): string[] => entries.flatMap(e => e.kind === 'file' ? [e.path] : flatten(e.children || []));
const basename = (p: string) => p.replace(/\\/g, '/').split('/').pop() || p;
const sessionKey = (w: Workspace) => `luma:session:${w.remote ? w.host : 'local'}:${w.root}${w.filesOnly ? ':files' : ''}`;
type PathDialog = { kind: 'file' | 'folder' | 'rename'; old?: string; value: string };
type PaletteItem = { id: string; title: string; detail: string; shortcut?: string; action: () => unknown; file?: string };

export default function App() {
  const [aiOpen,setAiOpen]=useState(false);
  const [config, setConfig] = useState<Config>({ theme: DEFAULT_THEME, recent: [], profiles: [] });
  const [workspace, setWorkspace] = useState<Workspace>(), [tabs, setTabs] = useState<Tab[]>([]), [active, setActive] = useState('$welcome'), [specials, setSpecials] = useState(['$welcome']);
  const [sidebar, setSidebar] = useState<'explorer' | 'search' | 'remote'>('explorer'), [sidebarVisible, setSidebarVisible] = useState(true), [sidebarWidth, setSidebarWidth] = useState(264), [openDirs, setOpenDirs] = useState(new Set<string>()), [outlineOpen, setOutlineOpen] = useState(true);
  const [bottomVisible, setBottomVisible] = useState(false), [bottomHeight, setBottomHeight] = useState(242), [bottomMode, setBottomMode] = useState<'terminal' | 'problems'>('terminal'), [terminals, setTerminals] = useState<TerminalInfo[]>([]), [activeTerminal, setActiveTerminal] = useState('');
  const [problems, setProblems] = useState<monaco.editor.IMarker[]>([]), [position, setPosition] = useState({ line: 1, column: 1 }), [runtime, setRuntime] = useState<Runtime>();
  const [busy, setBusy] = useState(''), [indexing, setIndexing] = useState(false), [revision, setRevision] = useState(0), [sshOpen, setSSHOpen] = useState(false), [helpOpen, setHelpOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; error: boolean }>(), [menu, setMenu] = useState(''), [context, setContext] = useState<{ entry: Entry; x: number; y: number }>(), [pathDialog, setPathDialog] = useState<PathDialog>(), [pathError, setPathError] = useState('');
  const [palette, setPalette] = useState<'files' | 'commands' | ''>(''), [paletteQuery, setPaletteQuery] = useState(''), [paletteIndex, setPaletteIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState(''), [searchCase, setSearchCase] = useState(false), [matches, setMatches] = useState<Match[]>([]), [searching, setSearching] = useState(false), [searchDone, setSearchDone] = useState(false), [searchTruncated, setSearchTruncated] = useState(false);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null), baseline = useRef(new Map<string, string>()), workspaceRef = useRef(workspace), tabsRef = useRef(tabs), configRef = useRef(config), activeRef = useRef(active), saveQueue = useRef(new Map<string, Promise<boolean>>()), generation = useRef(0), toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined), booted = useRef(false);
  workspaceRef.current = workspace; tabsRef.current = tabs; configRef.current = config; activeRef.current = active;
  const terminalsRef = useRef(terminals); terminalsRef.current = terminals;
  const privacy=usePrivacy();
  const theme = config.theme, activeTab = tabs.find(t => t.path === active);
  useEffect(()=>{if(!activeTab)presenceMetadata({file:'',line:0,column:0,editLine:0,mouseLine:0,mouseColumn:0,editing:false,sensitive:false});},[workspace?.root,activeTab?.path]);
  const aiContext=()=>({root:workspaceRef.current?.root||'',file:tabsRef.current.some(t=>t.path===activeRef.current)?activeRef.current:'',line:editorRef.current?.getPosition()?.lineNumber||1,column:editorRef.current?.getPosition()?.column||1,selection:editorRef.current?.getSelection()?editorRef.current?.getModel()?.getValueInRange(editorRef.current.getSelection()!):'',buffers:tabsRef.current.slice(0,30).map(t=>({path:t.path,content:models.get(t.path)?.getValue()||'',dirty:t.dirty})),diagnostics:problems.map(p=>({path:[...models].find(([,m])=>m.uri.toString()===p.resource.toString())?.[0]||'',line:p.startLineNumber,message:p.message}))});
  useEffect(()=>{const timer=setTimeout(()=>void window.luma.aiContext(aiContext()).catch(()=>{}),200);return()=>clearTimeout(timer);},[workspace?.root,active,tabs,position,problems]);
  const notify = useCallback((message: string, error = false) => { clearTimeout(toastTimer.current); setToast({ message, error }); if (error) void playSound('error'); toastTimer.current = setTimeout(() => setToast(undefined), error ? 14000 : 6000); }, []);
  const report = useCallback((e: unknown) => notify((e as Error).message.replace(/^Error invoking remote method '[^']+': Error: /, ''), true), [notify]);
  const openSpecial = useCallback((name: string) => { setSpecials(s => s.includes(name) ? s : [...s, name]); setActive(name); }, []);
  const updateTheme = useCallback((patch: Partial<Theme>) => setConfig(c => ({ ...c, theme: { ...c.theme, ...patch } })), []);
  useEffect(() => { defineTheme(theme); document.documentElement.dataset.theme = theme.preset; }, [theme]);
  useEffect(() => configureSounds(theme), [theme]);
  useEffect(installButtonSounds, []);
  useEffect(() => { if (!booted.current) return; const timer = setTimeout(() => { void window.luma.settings({ theme }).catch(report); }, 400); return () => clearTimeout(timer); }, [theme, report]);

  const saveFile = useCallback(async (p: string, quiet = false): Promise<boolean> => {
    if (saveQueue.current.has(p)) return saveQueue.current.get(p)!;
    const task = (async () => {
      const t = tabsRef.current.find(t => t.path === p), model = models.get(p), w = workspaceRef.current;
      if (!t || !model || !t.dirty) return true;
      const value = model.getValue();
      try {
        const result = await window.luma.writeFile(p, value, t.mtime, t.bom);
        if (workspaceRef.current !== w) return false;
        baseline.current.set(p, value);
        setTabs(ts => ts.map(tab => tab.path === p ? { ...tab, mtime: result.mtime, dirty: models.get(p)?.getValue() !== value } : tab));
        if (!quiet) { notify(`${basename(p)} 저장됨`); void playSound('success'); }
        setRevision(n => n + 1); return true;
      } catch (e) { report(e); return false; }
    })();
    saveQueue.current.set(p, task);
    try { return await task; } finally { saveQueue.current.delete(p); }
  }, [notify, report]);
  const saveAll = useCallback(async () => { for (const t of tabsRef.current.filter(t => t.dirty)) if (!await saveFile(t.path, true)) return false; return true; }, [saveFile]);
  const guardDirty = useCallback(async () => {
    const dirty = tabsRef.current.filter(t => t.dirty);
    if (!dirty.length) return true;
    const response = await window.luma.confirm('저장하지 않은 변경 사항이 있습니다.', `${dirty.map(t => t.name).join(', ')}\n계속하기 전에 저장하시겠습니까?`, ['취소', '저장하지 않음', '모두 저장']);
    if (response === 1) {
      for (const tab of dirty) { const value = baseline.current.get(tab.path); if (value !== undefined) models.get(tab.path)?.setValue(value); }
      setTabs(ts => ts.map(t => ({ ...t, dirty: false })));
      const w = workspaceRef.current;
      if (w) { try { localStorage.setItem(sessionKey(w), JSON.stringify({ active: activeRef.current, tabs: tabsRef.current.map(t => ({ path: t.path, mtime: t.mtime })) })); } catch {} }
      return true;
    }
    return response === 2 && await saveAll();
  }, [saveAll]);

  const openFile = useCallback(async (p: string, line?: number, column = 1) => {
    const w = workspaceRef.current; if (!w) return;
    try {
      if (!tabsRef.current.some(t => t.path === p)) {
        const result = await window.luma.readFile(p); if (workspaceRef.current !== w) return;
        const model = ensureModel(p, result.content, result.language);
        if (model.getValue() !== result.content) model.setValue(result.content);
        baseline.current.set(p, result.content);
        const tab = { path: p, name: basename(p), dirty: false, mtime: result.mtime, bom: result.bom, language: result.language };
        setTabs(ts => ts.some(t => t.path === p) ? ts : [...ts, tab]);
        void playSound('open');
      }
      setActive(p);
      const parents = p.split('/').slice(0, -1); setOpenDirs(dirs => { const next = new Set(dirs); parents.forEach((_, i) => next.add(parents.slice(0, i + 1).join('/'))); return next; });
      setTimeout(() => { const editor = editorRef.current; if (editor && editor.getModel() === models.get(p)) { if (line) { editor.setPosition({ lineNumber: line, column }); editor.revealLineInCenter(line); } editor.focus(); } }, 65);
    } catch (e) { report(e); }
  }, [report]);

  useEffect(()=>window.luma.onAIOpen(value=>{void openFile(value.path,value.line);}),[openFile]);
  const installWorkspace = useCallback(async (w: Workspace) => {
    generation.current++; const epoch = generation.current;
    resetModels(w); baseline.current.clear(); setWorkspace(w); workspaceRef.current = w; setTabs([]); tabsRef.current = []; setTerminals([]); setActiveTerminal(''); setProblems([]); setRuntime(undefined); setMatches([]); setSearchDone(false); setBottomVisible(false); setOpenDirs(new Set(w.tree.filter(e => e.kind === 'directory').slice(0, 3).map(e => e.path))); setSidebar('explorer'); setSpecials(['$map']); setActive('$map');
    setConfig(c => ({ ...c, recent: w.remote || w.filesOnly ? c.recent : [w.root, ...c.recent.filter(p => p !== w.root)].slice(0, 8) }));
    try {
      const cached = JSON.parse(localStorage.getItem(sessionKey(w)) || 'null');
      if (cached?.tabs?.length) {
        const restored: Tab[] = [];
        for (const item of cached.tabs.slice(0, 30)) {
          try {
            const result = await window.luma.readFile(item.path); if (generation.current !== epoch) return;
            const dirty = typeof item.backup === 'string' && item.backup !== result.content;
            ensureModel(item.path, dirty ? item.backup : result.content, result.language); baseline.current.set(item.path, result.content);
            restored.push({ path: item.path, name: basename(item.path), ...result, mtime: dirty && typeof item.mtime === 'number' ? item.mtime : result.mtime, dirty });
          } catch { /* Removed files are omitted from the restored session. */ }
        }
        setTabs(restored); tabsRef.current = restored;
        if (restored.some(t => t.path === cached.active)) setActive(cached.active);
        if (restored.some(t => t.dirty)) notify('저장하지 않았던 편집 내용을 복구했습니다.');
      }
    } catch { /* An invalid cache should not prevent opening a folder. */ }
    setIndexing(true);
    void window.luma.sources().then(s => { if (generation.current !== epoch) return; seedModels(s.files, new Set(tabsRef.current.map(t => t.path))); if (s.truncated) notify(`자동 완성 인덱스: ${s.files.length} / ${s.total}개 파일. 열어 본 파일은 추가로 포함됩니다.`); }).catch(report).finally(() => { if (generation.current === epoch) setIndexing(false); });
    void window.luma.runtimes().then(r => { if (generation.current === epoch) setRuntime(r); }).catch(report);
    if (w.truncated) notify('큰 폴더의 처음 3,000개 항목을 표시합니다. 하위 폴더를 열면 더 자세히 볼 수 있습니다.');
  }, [notify, report]);
  const openFolder = useCallback(async (folder?: string) => {
    try {
      const chosen = folder || await window.luma.chooseFolder(); if (!chosen || !await guardDirty()) return;
      setBusy('폴더를 여는 중…'); await installWorkspace(await window.luma.openFolder(chosen));
    } catch (e) { report(e); } finally { setBusy(''); }
  }, [guardDirty, installWorkspace, report]);
  const pickFile = useCallback(async (file?: string) => {
    try {
      const chosen = file || await window.luma.chooseFile(); if (!chosen) return;
      const w = workspaceRef.current;
      const normalized = chosen.replace(/\\/g, '/').toLowerCase();
      const root = w?.root.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase();
      const same = w && !w.remote && root && normalized.startsWith(root + '/');
      if (!same && !await guardDirty()) return;
      finishReveal(); setBusy('파일을 여는 중…');
      const result = await window.luma.openPickedFile(chosen);
      if (!result.sameWorkspace) await installWorkspace(result.workspace);
      else { setWorkspace(result.workspace); workspaceRef.current = result.workspace; setRevision(n => n + 1); }
      if (result.workspace.filesOnly) setSpecials(s => s.filter(p => p !== '$map' && p !== '$welcome'));
      setConfig(c => ({ ...c, recentFiles: [chosen, ...(c.recentFiles || []).filter(p => p !== chosen)].slice(0, 8) }));
      await openFile(result.path);
    } catch (e) { report(e); } finally { setBusy(''); }
  }, [guardDirty, installWorkspace, openFile, report]);
  const connectSSH = useCallback(async (p: Profile) => { if (!await guardDirty()) return; await installWorkspace(await window.luma.connect(p)); setConfig(c => ({ ...c, profiles: [{ ...p, password: undefined, passphrase: undefined }, ...c.profiles.filter(profile => profile.host !== p.host || profile.username !== p.username)] })); setSSHOpen(false); notify(`${p.username}@${p.host} 연결됨`); void playSound('success'); }, [guardDirty, installWorkspace, notify]);

  useEffect(() => {
    void window.luma.bootstrap().then(async data => { setConfig({ ...data.config, theme: { ...DEFAULT_THEME, ...data.config.theme } }); booted.current = true; if (data.initialFolder) await openFolder(data.initialFolder); }).catch(report);
  }, []);
  useEffect(() => {
    if (!workspace) return;
    const timer = setTimeout(() => { try { localStorage.setItem(sessionKey(workspace), JSON.stringify({ active, tabs: tabs.map(t => ({ path: t.path, mtime: t.mtime, backup: t.dirty ? models.get(t.path)?.getValue() : undefined })) })); } catch { /* Disk files remain authoritative when the recovery cache is full. */ } }, 300);
    return () => clearTimeout(timer);
  }, [tabs, active, workspace]);
  useEffect(() => {
    if (!theme.autoSave) return;
    const timer = setTimeout(() => { void saveAll(); }, 1000); return () => clearTimeout(timer);
  }, [tabs, theme.autoSave, saveAll]);

  const refresh = useCallback(async () => { if (!workspaceRef.current) return; try { const w = await window.luma.refresh(); setWorkspace(w); workspaceRef.current = w; setRevision(n => n + 1); } catch (e) { report(e); } }, [report]);
  useEffect(() => window.luma.onFiles(async () => {
    const w = workspaceRef.current; if (!w || w.remote || saveQueue.current.size) return;
    try {
      const next = await window.luma.refresh(); if (workspaceRef.current !== w) return; setWorkspace(next); workspaceRef.current = next; setRevision(n => n + 1);
      for (const tab of tabsRef.current.filter(t => !t.dirty)) {
        try { const result = await window.luma.readFile(tab.path); if (workspaceRef.current !== next) return; const model = models.get(tab.path); if (model && model.getValue() !== result.content && !tabsRef.current.find(t => t.path === tab.path)?.dirty) { baseline.current.set(tab.path, result.content); model.setValue(result.content); } setTabs(ts => ts.map(t => t.path === tab.path && !t.dirty ? { ...t, mtime: result.mtime } : t)); } catch {}
      }
    } catch {}
  }), []);
  useEffect(() => window.luma.onDisconnect(({ message }) => { setWorkspace(undefined); workspaceRef.current = undefined; generation.current++; setTerminals(ts => ts.map(t => ({ ...t, exited: true }))); notify(message, true); }), [notify]);
  useEffect(() => window.luma.onTerminalExit(({ id, code }) => { if (terminalsRef.current.find(t => t.id === id)?.run) void playSound(code === 0 ? 'success' : 'error'); setTerminals(ts => ts.map(t => t.id === id ? { ...t, exited: true, code } : t)); }), []);

  const closeTab = useCallback(async (p: string) => {
    const t = tabsRef.current.find(t => t.path === p);
    if (t?.dirty) { const r = await window.luma.confirm(`${t.name} 변경 사항을 저장하시겠습니까?`, '', ['취소', '저장하지 않음', '저장']); if (!r || r === 2 && !await saveFile(p, true)) return; if (r === 1) { const m = models.get(p), value = baseline.current.get(p); if (m && value !== undefined) m.setValue(value); } }
    const sequence = [...specials, ...tabsRef.current.map(t => t.path)], index = sequence.indexOf(p), remaining = sequence.filter(s => s !== p);
    setTabs(ts => ts.filter(t => t.path !== p)); setSpecials(s => s.filter(t => t !== p));
    if (activeRef.current === p) setActive(remaining[Math.min(index, remaining.length - 1)] || '$welcome');
    if (!remaining.length) setSpecials(['$welcome']);
  }, [saveFile, specials]);
  const createTerminal = useCallback(async (run = false) => {
    if (!workspaceRef.current) { notify('먼저 작업 폴더를 열어주세요.'); return; }
    const file = activeRef.current;
    if (run && file.startsWith('$')) { notify('실행할 코드 파일을 먼저 열어주세요.'); return; }
    if (run && !await saveFile(file, true)) return;
    try { const term = await window.luma.terminalCreate(run ? { runPath: file } : {}); setTerminals(ts => [...ts, term]); setActiveTerminal(term.id); setBottomMode('terminal'); setBottomVisible(true); } catch (e) { report(e); }
  }, [notify, report, saveFile]);
  const toggleTerminal = useCallback(() => { if (!terminals.length) void createTerminal(); else { setBottomMode('terminal'); setBottomVisible(v => !v || bottomMode !== 'terminal'); } }, [terminals.length, createTerminal, bottomMode]);
  const closeTerminal = useCallback(async (id: string) => { await window.luma.terminalClose(id); forgetTerminal(id); setTerminals(ts => { const next = ts.filter(t => t.id !== id); if (activeTerminal === id) setActiveTerminal(next.at(-1)?.id || ''); return next; }); }, [activeTerminal]);
  const onCodeChange = useCallback((p: string, content: string) => {
    setTabs(ts => ts.map(t => t.path === p ? { ...t, dirty: content !== baseline.current.get(p) } : t));
    const model = models.get(p); if (model?.getLanguageId() === 'python') { clearTimeout((model as any).__lumaSync); (model as any).__lumaSync = setTimeout(() => { if (!model.isDisposed()) schedulePython(model); }, 350); }
  }, []);

  useEffect(() => {
    if (!workspace || !searchQuery) { setMatches([]); setSearchDone(false); return; }
    let cancelled = false; setSearching(true);
    const timer = setTimeout(() => { void window.luma.search(searchQuery, searchCase).then(r => { if (!cancelled) { setMatches(r.matches); setSearchTruncated(r.truncated); setSearchDone(true); } }).catch(report).finally(() => { if (!cancelled) setSearching(false); }); }, 350);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [workspace?.root, workspace?.host, searchQuery, searchCase, revision, report]);
  const commands: PaletteItem[] = [
    { id: 'open-file', title: '파일 열기', detail: '개별 파일 편집', shortcut: 'Ctrl+O', action: () => pickFile() },
    { id: 'open', title: '폴더 열기', detail: '작업 공간', shortcut: 'Ctrl+Shift+O', action: () => openFolder() },
    { id: 'map', title: '프로젝트 구조 보기', detail: '폴더 구조 · 의존 관계', shortcut: 'Ctrl+Shift+G', action: () => workspace ? openSpecial('$map') : notify('먼저 작업 폴더를 열어주세요.') },
    { id: 'save', title: '현재 파일 저장', detail: '파일', shortcut: 'Ctrl+S', action: () => saveFile(active) },
    { id: 'save-all', title: '모든 파일 저장', detail: '파일', shortcut: 'Ctrl+Alt+S', action: saveAll },
    { id: 'run', title: '현재 파일 실행', detail: '실행', shortcut: 'F5', action: () => createTerminal(true) },
    { id: 'terminal', title: '새 터미널', detail: '터미널', shortcut: 'Ctrl+Shift+`', action: () => createTerminal() },
    { id: 'ssh', title: 'SSH 원격 서버 연결', detail: '원격 작업 공간', action: () => setSSHOpen(true) },
    { id: 'theme', title: '테마와 편집기 설정', detail: '환경 설정', shortcut: 'Ctrl+,', action: () => openSpecial('$settings') },
    { id: 'sidebar', title: '사이드바 표시 / 숨기기', detail: '레이아웃', shortcut: 'Ctrl+B', action: () => setSidebarVisible(v => !v) },
    { id: 'refresh', title: '파일 및 구조도 새로 고침', detail: '작업 공간', action: refresh },
    { id: 'help', title: '키보드 단축키', detail: '도움말', action: () => setHelpOpen(true) },
  ];
  const paletteItems: PaletteItem[] = palette === 'files' && workspace ? flatten(workspace.tree).map(p => ({ id: p, title: basename(p), detail: p, file: p, action: () => openFile(p) })).filter(p => p.detail.toLowerCase().includes(paletteQuery.toLowerCase())).slice(0, 60) : commands.filter(c => `${c.title} ${c.detail}`.toLowerCase().includes(paletteQuery.toLowerCase()));
  const showPalette = useCallback((mode: 'commands' | 'files') => { setPaletteQuery(''); setPaletteIndex(0); setPalette(mode); }, []);
  useEffect(() => {
    const keydown = (e: KeyboardEvent) => {
      finishReveal();
      if (palette || sshOpen || pathDialog || helpOpen) return;
      const mod = e.ctrlKey || e.metaKey;
      let handled = true;
      if (mod && e.key.toLowerCase() === 's' && e.altKey) void saveAll();
      else if (mod && e.key.toLowerCase() === 's') void saveFile(activeRef.current);
      else if (mod && e.key.toLowerCase() === 'o') { if (e.shiftKey) void openFolder(); else void pickFile(); }
      else if (mod && e.key.toLowerCase() === 'k') showPalette('commands');
      else if (mod && e.key.toLowerCase() === 'p') showPalette(e.shiftKey ? 'commands' : 'files');
      else if (mod && e.shiftKey && e.key.toLowerCase() === 'l') setAiOpen(v=>!v);
      else if (mod && e.key === ',') openSpecial('$settings');
      else if (mod && e.key.toLowerCase() === 'b') setSidebarVisible(v => !v);
      else if (mod && e.shiftKey && e.key.toLowerCase() === 'g') { if (workspaceRef.current) openSpecial('$map'); }
      else if (mod && e.shiftKey && e.key.toLowerCase() === 'f') { setSidebar('search'); setSidebarVisible(true); setTimeout(() => document.querySelector<HTMLInputElement>('.workspace-search input')?.focus(), 30); }
      else if (mod && e.shiftKey && e.key.toLowerCase() === 'e') { setSidebar('explorer'); setSidebarVisible(true); }
      else if (mod && e.key === '`') { if (e.shiftKey) void createTerminal(); else toggleTerminal(); }
      else if (mod && e.key.toLowerCase() === 'w') void closeTab(activeRef.current);
      else if (mod && e.shiftKey && e.key.toLowerCase() === 'm') { setBottomVisible(v => !v || bottomMode !== 'problems'); setBottomMode('problems'); }
      else if (e.key === 'F5') void createTerminal(true);
      else if (e.key === 'Escape') { setContext(undefined); setMenu(''); }
      else handled = false;
      if (handled) { e.preventDefault(); e.stopPropagation(); }
    };
    window.addEventListener('keydown', keydown, true); return () => window.removeEventListener('keydown', keydown, true);
  });
  useEffect(() => window.luma.onMenu(async action => { if (action === 'app-close' && await guardDirty()) { await window.luma.settings({ theme: configRef.current.theme }); await window.luma.window('close-confirmed'); } }), [guardDirty]);
  useEffect(() => { if (!context && !menu) return; const dismiss = () => { setContext(undefined); setMenu(''); }; window.addEventListener('click', dismiss); return () => window.removeEventListener('click', dismiss); }, [context, menu]);

  const startResize = (e: React.PointerEvent, target: 'sidebar' | 'bottom') => {
    e.preventDefault(); const x = e.clientX, y = e.clientY, width = sidebarWidth, height = bottomHeight; document.body.classList.add('resizing');
    const move = (event: PointerEvent) => target === 'sidebar' ? setSidebarWidth(Math.max(190, Math.min(480, width + event.clientX - x))) : setBottomHeight(Math.max(140, Math.min(window.innerHeight - 260, height + y - event.clientY)));
    const stop = () => { document.body.classList.remove('resizing'); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', stop);
  };
  const showPathDialog = (kind: PathDialog['kind'], initial = '', old?: string) => { setPathError(''); setPathDialog({ kind, value: initial, old }); setContext(undefined); };
  const submitPath = async () => {
    if (!pathDialog) return;
    const name = pathDialog.value.trim().replace(/\\/g, '/'); if (!name) return;
    setPathError('');
    try {
      if (pathDialog.kind === 'rename') {
        const old = pathDialog.old!, affected = tabsRef.current.filter(t => t.path === old || t.path.startsWith(old + '/'));
        if (affected.some(t => t.dirty) && !await guardDirty()) return;
        const w = await window.luma.rename(old, name); setWorkspace(w); workspaceRef.current = w;
        setTabs(ts => ts.filter(t => t.path !== old && !t.path.startsWith(old + '/')));
        for (const [p, model] of models) if (p === old || p.startsWith(old + '/')) { model.dispose(); models.delete(p); baseline.current.delete(p); }
        const wasActive = active === old || active.startsWith(old + '/');
        if (wasActive) { setActive('$map'); setTimeout(() => { void openFile(name + active.slice(old.length)); }, 60); }
      } else {
        const w = await window.luma.create(name, pathDialog.kind === 'folder'); setWorkspace(w); workspaceRef.current = w;
        if (pathDialog.kind === 'file') void openFile(name); else setOpenDirs(d => new Set([...d, name]));
      }
      setPathDialog(undefined); setRevision(n => n + 1); void playSound('success');
    } catch (e) { void playSound('error'); setPathError((e as Error).message.replace(/^Error invoking remote method '[^']+': Error: /, '')); }
  };
  const trashEntry = async (entry: Entry) => {
    if (tabsRef.current.some(t => (t.path === entry.path || t.path.startsWith(entry.path + '/')) && t.dirty) && !await guardDirty()) return;
    const r = await window.luma.confirm(`${entry.name}을(를) 휴지통으로 이동하시겠습니까?`, entry.path, ['취소', '휴지통으로 이동']); if (!r) return;
    try { const w = await window.luma.trash(entry.path); setWorkspace(w); workspaceRef.current = w; setTabs(ts => ts.filter(t => t.path !== entry.path && !t.path.startsWith(entry.path + '/'))); if (active === entry.path || active.startsWith(entry.path + '/')) openSpecial('$map'); setRevision(n => n + 1); } catch (e) { report(e); }
  };
  const disconnect = async () => { if (!await guardDirty()) return; await window.luma.disconnect(); generation.current++; setWorkspace(undefined); workspaceRef.current = undefined; setTabs([]); tabsRef.current = []; setTerminals([]); setSpecials(['$welcome']); setActive('$welcome'); setBottomVisible(false); };
  const outline = useMemo(() => {
    const content = activeTab && models.get(activeTab.path)?.getValue(); if (!content) return [];
    return content.split(/\r?\n/).flatMap((line, i) => { const m = /^\s*(?:(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function|class|interface|type|enum|def|fn|func)\s+([\w-]+)|(?:export\s+)?(?:const|let)\s+(\w+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|\w+)\s*=>)/.exec(line); return m ? [{ name: m[1] || m[2], line: i + 1, kind: line.includes('class ') ? 'C' : 'ƒ' }] : []; });
  }, [activeTab, tabs]);
  const groupedMatches = useMemo(() => { const grouped = new Map<string, Match[]>(); matches.forEach(m => grouped.set(m.path, [...(grouped.get(m.path) || []), m])); return grouped; }, [matches]);
  const errorCount = problems.filter(p => p.severity === monaco.MarkerSeverity.Error).length, warningCount = problems.filter(p => p.severity === monaco.MarkerSeverity.Warning).length;
  const specialLabel = (p: string) => p === '$map' ? '프로젝트 구조' : p === '$settings' ? '설정' : '시작';
  const menus: Record<string, { title: string; shortcut?: string; action: () => unknown }[]> = {
    '파일': [{ title: '파일 열기…', shortcut: 'Ctrl+O', action: () => pickFile() }, { title: '폴더 열기…', shortcut: 'Ctrl+Shift+O', action: () => openFolder() }, { title: '새 파일…', action: () => workspace ? showPathDialog('file') : notify('먼저 폴더를 열어주세요.') }, { title: '저장', shortcut: 'Ctrl+S', action: () => saveFile(active) }, { title: '모두 저장', shortcut: 'Ctrl+Alt+S', action: saveAll }, { title: '현재 탭 닫기', shortcut: 'Ctrl+W', action: () => closeTab(active) }],
    '편집': [{ title: '실행 취소', shortcut: 'Ctrl+Z', action: () => editorRef.current?.trigger('menu', 'undo', null) }, { title: '다시 실행', shortcut: 'Ctrl+Y', action: () => editorRef.current?.trigger('menu', 'redo', null) }, { title: '현재 파일에서 찾기', shortcut: 'Ctrl+F', action: () => editorRef.current?.getAction('actions.find')?.run() }, { title: '프로젝트에서 찾기', shortcut: 'Ctrl+Shift+F', action: () => { setSidebar('search'); setSidebarVisible(true); } }, { title: '문서 서식 지정', shortcut: 'Shift+Alt+F', action: () => editorRef.current?.getAction('editor.action.formatDocument')?.run() }],
    '보기': [{ title: '프로젝트 구조', shortcut: 'Ctrl+Shift+G', action: () => workspace ? openSpecial('$map') : notify('먼저 폴더를 열어주세요.') }, { title: '빠른 파일 열기', shortcut: 'Ctrl+P', action: () => showPalette('files') }, { title: '명령 팔레트', shortcut: 'Ctrl+Shift+P', action: () => showPalette('commands') }, { title: '사이드바 표시 / 숨기기', shortcut: 'Ctrl+B', action: () => setSidebarVisible(v => !v) }, { title: '테마와 편집기 설정', shortcut: 'Ctrl+,', action: () => openSpecial('$settings') }],
    '터미널': [{ title: '새 터미널', action: () => createTerminal() }, { title: '현재 파일 실행', shortcut: 'F5', action: () => createTerminal(true) }, { title: '터미널 표시 / 숨기기', shortcut: 'Ctrl+`', action: toggleTerminal }, { title: 'SSH 서버에 연결…', action: () => setSSHOpen(true) }],
    '도움말': [{ title: '키보드 단축키', action: () => setHelpOpen(true) }, { title: 'Vexel 정보', action: () => notify('Vexel 1.6.0 · Monaco Editor · Electron · Pyright') }],
  };

  return <div className="app" style={{ '--accent': theme.accent, '--workspace-bg': theme.background, '--sidebar-width': `${sidebarWidth}px` } as React.CSSProperties}>
    {theme.image && <div className="app-wallpaper" style={{ backgroundImage: `url("${theme.image}")`, filter: `blur(${theme.blur}px)` }}/>}<div className="app-tint" style={{ background: theme.background, opacity: theme.image ? theme.opacity / 100 : 1 }}/>
    <header className="titlebar"><div className="brand"><Logo size={21}/></div><nav className="menubar">{Object.keys(menus).map(name => <div className="menu-anchor" key={name}><button className={menu === name ? 'open' : ''} onClick={e => { e.stopPropagation(); setMenu(menu === name ? '' : name); }}>{name}</button>{menu === name && <div className="dropdown menu-dropdown">{menus[name].map(item => <button key={item.title} onClick={() => { setMenu(''); void item.action(); }}><span>{item.title}</span><kbd>{item.shortcut}</kbd></button>)}</div>}</div>)}</nav><button className="title-command" title="명령 팔레트 · Ctrl+Shift+P" onClick={() => showPalette('commands')}><Search size={13}/><span>{workspace ? `${workspace.name}${workspace.remote ? ` [SSH: ${workspace.host}]` : ''}` : 'Vexel'}</span><kbd>Ctrl K</kbd></button><div className="title-layout"><IconButton title="Vexel AI · Ctrl+Shift+L" onClick={()=>setAiOpen(v=>!v)}><Sparkles size={15}/></IconButton><IconButton title="사이드바 표시 / 숨기기" onClick={() => setSidebarVisible(v => !v)}><PanelLeft size={15}/></IconButton><IconButton title="터미널 표시 / 숨기기" onClick={toggleTerminal}><PanelBottom size={15}/></IconButton></div><div className="window-controls"><button title="최소화" onClick={() => window.luma.window('minimize')}><Minus size={15}/></button><button title="최대화 / 복원" onClick={() => window.luma.window('maximize')}><Square size={11}/></button><button title="창 닫기" className="window-close" onClick={() => window.luma.window('close')}><X size={17}/></button></div></header>
    <div className="workbench"><aside className="activitybar"><div className="activity-main"><button className={sidebarVisible && sidebar === 'explorer' ? 'active' : ''} title="탐색기 · Ctrl+Shift+E" onClick={() => { if (sidebar === 'explorer' && sidebarVisible) setSidebarVisible(false); else { setSidebar('explorer'); setSidebarVisible(true); } }}><Files size={22}/></button><button className={sidebarVisible && sidebar === 'search' ? 'active' : ''} title="검색 · Ctrl+Shift+F" onClick={() => { setSidebar('search'); setSidebarVisible(true); }}><Search size={22}/></button><button className={active === '$map' ? 'active' : ''} title="프로젝트 구조 · Ctrl+Shift+G" onClick={() => workspace ? openSpecial('$map') : notify('먼저 작업 폴더를 열어주세요.')}><Network size={22}/></button><button className={sidebarVisible && sidebar === 'remote' ? 'active' : ''} title="SSH 원격 연결" onClick={() => { setSidebar('remote'); setSidebarVisible(true); }}><Monitor size={22}/>{workspace?.remote && <i className="activity-badge"/>}</button></div><div className="activity-bottom"><button className={aiOpen?'active':''} title="Vexel AI · Ctrl+Shift+L" onClick={()=>setAiOpen(v=>!v)}><Sparkles size={22}/></button><button title="단축키 도움말" onClick={() => setHelpOpen(true)}><CircleHelp size={21}/></button><button className={active === '$settings' ? 'active' : ''} title="설정 · Ctrl+," onClick={() => openSpecial('$settings')}><Settings2 size={22}/></button></div></aside>
    {sidebarVisible && <aside className="sidebar"><div className="sidebar-heading"><span>{sidebar === 'explorer' ? '탐색기' : sidebar === 'search' ? '검색' : '원격 탐색기'}</span><IconButton title="사이드바 접기" onClick={() => setSidebarVisible(false)}><PanelLeftClose size={15}/></IconButton></div>
      {sidebar === 'explorer' ? workspace ? <><div className="workspace-title"><ChevronDown size={13}/><b title={workspace.root}>{workspace.name}</b><div className="tree-actions"><IconButton title="파일 열기 · Ctrl+O" onClick={() => pickFile()}><FolderOpen size={14}/></IconButton><IconButton title="새 파일" onClick={() => showPathDialog('file')}><FilePlus2 size={14}/></IconButton><IconButton title="새 폴더" onClick={() => showPathDialog('folder')}><FolderPlus size={14}/></IconButton><IconButton title="새로 고침" onClick={() => refresh()}><RefreshCw size={13}/></IconButton><IconButton title="폴더 모두 접기" onClick={() => setOpenDirs(new Set())}><ChevronsDownUp size={14}/></IconButton></div></div><div className="file-tree"><FileTree tree={workspace.tree} active={active} onOpen={openFile} openDirs={openDirs} toggleDir={p => setOpenDirs(d => { const next = new Set(d); next.has(p) ? next.delete(p) : next.add(p); return next; })} onContext={(entry, x, y) => setContext({ entry, x, y })}/>{!workspace.tree.length && <p className="sidebar-hint">비어 있는 폴더입니다.<br/>새 파일을 만들어 시작하세요.</p>}{workspace.truncated && <p className="sidebar-hint warning-text">일부 항목만 표시됩니다.</p>}</div><div className="outline"><button className="section-heading" onClick={() => setOutlineOpen(v => !v)}>{outlineOpen ? <ChevronDown size={13}/> : <ChevronRight size={13}/>}개요<span>{outline.length}</span></button>{outlineOpen && <div className="outline-items">{outline.length ? outline.map((s, i) => <button key={i} onClick={() => openFile(active, s.line)}><span className="symbol-letter">{s.kind}</span><span>{s.name}</span><small>{s.line}</small></button>) : <p className="sidebar-hint">{activeTab ? '표시할 심볼이 없습니다.' : '파일을 열면 심볼이 표시됩니다.'}</p>}</div>}</div></> : <div className="sidebar-empty"><FolderOpen size={29}/><p>파일 또는 폴더를 열어<br/>코드를 살펴보세요.</p><button className="button primary" onClick={() => pickFile()}>파일 열기</button><button className="button secondary" onClick={() => openFolder()}>폴더 열기</button><button className="text-button" onClick={() => setSSHOpen(true)}>SSH 서버에 연결 <ArrowUpRight size={12}/></button></div> : sidebar === 'search' ? <><div className="workspace-search"><label><input aria-label="프로젝트 검색" placeholder="프로젝트에서 검색" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}/><button className={searchCase ? 'enabled' : ''} title="대소문자 구분" onClick={() => setSearchCase(v => !v)}><CaseSensitive size={17}/></button></label><p>{!workspace ? '폴더를 먼저 열어주세요.' : searching ? '검색 중…' : searchDone ? `${matches.length}${searchTruncated ? '+' : ''}개 결과 · ${groupedMatches.size}개 파일` : '저장된 텍스트 파일 내용을 검색합니다.'}</p></div><div className="search-results">{[...groupedMatches].map(([p, results]) => <div className="search-group" key={p}><button className="search-file" title={p} onClick={() => openFile(p)}><FileIcon path={p}/><b>{basename(p)}</b><span>{results.length}</span></button><small className="search-path">{p}</small>{results.map((m, i) => <button key={i} className="search-match" title={m.text} onClick={() => openFile(p, m.line, m.column)}><span>{m.line}</span><code>{m.text}</code></button>)}</div>)}{searchDone && !matches.length && !searching && <p className="sidebar-hint">일치하는 결과가 없습니다.</p>}{searchTruncated && <p className="sidebar-hint warning-text">검색 범위 또는 결과 수 제한이 적용되었습니다.</p>}</div></> : <div className="remote-sidebar"><div className="remote-heading"><Server size={28}/><h3>어디서든 이어서.</h3><p>SSH로 서버의 파일과 터미널에 연결합니다.</p></div><button className="button primary" onClick={() => setSSHOpen(true)}><Plus size={15}/>새 연결</button>{workspace?.remote && <div className="connected-host"><span className="connected-dot"/>연결됨<b>{workspace.host}</b><small>{workspace.root}</small><button className="text-button" onClick={disconnect}>연결 종료</button></div>}{config.profiles.length > 0 && <><h4>저장된 연결</h4>{config.profiles.map((p, i) => <button className="saved-host" key={i} onClick={() => setSSHOpen(true)}><Server size={16}/><span><b>{p.host}</b><small>{p.username} · {p.port}</small></span><ChevronRight size={13}/></button>)}</>}<p className="sidebar-hint">원격 변경 사항은 새로 고침으로 불러올 수 있습니다.</p></div>}
      <div className="sidebar-resizer" onPointerDown={e => startResize(e, 'sidebar')}/></aside>}
    <main className="main-area"><div className="editor-tabs"><div className="tab-scroll">{[...specials, ...tabs.map(t => t.path)].map(p => { const tab = tabs.find(t => t.path === p); return <div role="tab" aria-selected={active === p} tabIndex={0} className={`editor-tab ${active === p ? 'active' : ''}`} key={p} onClick={() => setActive(p)} onKeyDown={e => { if (e.key === 'Enter') setActive(p); }} title={tab ? tab.path : specialLabel(p)}>{tab ? <FileIcon path={p}/> : p === '$map' ? <Network size={14}/> : p === '$settings' ? <Settings2 size={14}/> : <Logo size={15}/>}<span>{tab?.name || specialLabel(p)}</span><button title={tab?.dirty ? '변경된 파일 닫기' : '탭 닫기'} onClick={e => { e.stopPropagation(); void closeTab(p); }}>{tab?.dirty ? <Circle size={8} fill="currentColor" className="dirty-dot"/> : <X size={13}/>}</button></div>; })}</div><div className="editor-tools"><IconButton title="파일 실행 · F5" disabled={!activeTab || !!busy || !workspace} onClick={() => createTerminal(true)}><Play size={15} className="run-icon"/></IconButton><IconButton title="명령 팔레트" onClick={() => showPalette('commands')}><MoreHorizontal size={17}/></IconButton></div></div>
      {activeTab && <div className="breadcrumbs"><span>{workspace?.name || '연결 종료됨'}</span>{active.split('/').map((part, i, arr) => <span key={i}><ChevronRight size={12}/>{i === arr.length - 1 && <FileIcon path={active} size={13}/>} {part}</span>)}</div>}
      <div className="editor-content"><div className={`code-surface ${activeTab ? 'shown' : ''}`}><EditorView active={activeTab} theme={theme} onChange={onCodeChange} onPosition={(line, column) => setPosition({ line, column })} onProblems={setProblems} editorRef={editorRef}/></div>
        {active === '$welcome' && <div className="welcome"><div className="welcome-inner"><div className="welcome-kicker"><span className="connected-dot"/>YOUR SPACE TO BUILD</div><div className="welcome-logo"><Logo size={59}/></div><h1>Vexel<span>코드에 집중하는 공간.</span></h1><p className="welcome-description">익숙한 편집기, 한눈에 보이는 구조.<br/>당신의 다음 아이디어를 여기서 시작하세요.</p><div className="welcome-actions"><button className="button primary" onClick={() => pickFile()}><Files size={17}/>파일 열기 <kbd>Ctrl O</kbd></button><button className="button secondary" onClick={() => openFolder()}><FolderOpen size={17}/>폴더 열기</button><button className="button secondary" onClick={() => setSSHOpen(true)}><Monitor size={16}/>SSH로 연결 <ArrowUpRight size={14}/></button></div><div className="welcome-lower"><section><h3>최근 작업</h3>{config.recent.length ? config.recent.slice(0, 4).map(p => <button className="recent-item" key={p} onClick={() => openFolder(p)} title={p}><FolderOpen size={15}/><div><b>{basename(p)}</b><span>{p}</span></div><ArrowUpRight size={13}/></button>) : !config.recentFiles?.length ? <p className="muted small">열어 본 파일과 폴더가 여기에 표시됩니다.</p> : null}{config.recentFiles?.slice(0, 3).map(p => <button className="recent-item" key={p} onClick={() => pickFile(p)} title={p}><FileIcon path={p}/><div><b>{basename(p)}</b><span>{p}</span></div><ArrowUpRight size={13}/></button>)}</section><section className="welcome-shortcuts"><h3>빠르게 시작하기</h3><button onClick={() => showPalette('commands')}><Command size={15}/><span>명령 팔레트</span><kbd>Ctrl Shift P</kbd></button><button onClick={() => openSpecial('$settings')}><Palette size={15}/><span>나만의 테마</span><kbd>Ctrl ,</kbd></button><button onClick={() => setHelpOpen(true)}><Keyboard size={15}/><span>키보드 단축키</span><ChevronRight size={13}/></button></section></div><div className="welcome-footer"><span>설계하고. 연결하고. 실행하세요.</span><span>VEXEL / 1.6</span></div></div></div>}
        {active === '$map' && (workspace ? <ProjectMap workspace={workspace} onOpen={openFile} revision={revision}/> : <div className="center-empty"><Network size={38}/><h2>폴더를 열어 구조를 살펴보세요.</h2><button className="button primary" onClick={() => openFolder()}>폴더 열기</button></div>)}
        {active === '$settings' && <Settings theme={theme} update={updateTheme} error={report}/>}
        {busy && <div className="busy-overlay"><Spinner label={busy}/></div>}
      </div>
      <section className="bottom-panel" style={{ height: bottomHeight, display: bottomVisible ? 'flex' : 'none' }}><div className="bottom-resizer" onPointerDown={e => startResize(e, 'bottom')}/><div className="bottom-header"><div className="bottom-modes"><button className={bottomMode === 'terminal' ? 'active' : ''} onClick={() => setBottomMode('terminal')}>터미널</button><button className={bottomMode === 'problems' ? 'active' : ''} onClick={() => setBottomMode('problems')}>문제{problems.length > 0 && <span>{problems.length}</span>}</button></div><div className="terminal-tabs">{bottomMode === 'terminal' && terminals.map(t => <button className={activeTerminal === t.id ? 'active' : ''} key={t.id} onClick={() => setActiveTerminal(t.id)} title={t.exited ? `종료 코드 ${t.code}` : '실행 중'}>{t.exited ? t.code === 0 ? <Check size={12}/> : <CircleX size={12}/> : <TerminalSquare size={12}/>}<span>{t.name}</span><span className="terminal-close" role="button" aria-label="터미널 닫기" onClick={e => { e.stopPropagation(); void closeTerminal(t.id); }}><X size={12}/></span></button>)}</div><div className="bottom-tools">{bottomMode === 'terminal' && <><IconButton title="새 터미널" onClick={() => createTerminal()}><Plus size={16}/></IconButton><IconButton title="터미널 지우기" onClick={() => clearTerminal(activeTerminal)}><Trash2 size={14}/></IconButton></>}<IconButton title="패널 닫기" onClick={() => setBottomVisible(false)}><X size={16}/></IconButton></div></div><div className="bottom-body"><div className="terminal-panels" style={{ display: bottomMode === 'terminal' ? 'block' : 'none' }}>{terminals.map(t => <TerminalPanel key={t.id} session={t} active={activeTerminal === t.id} visible={bottomVisible && bottomMode === 'terminal'} theme={theme}/>)}{!terminals.length && <div className="terminal-empty"><TerminalSquare size={22}/><span>명령을 실행할 준비가 되었습니다.</span><button className="text-button" onClick={() => createTerminal()}>새 터미널 열기 <Plus size={13}/></button></div>}</div>{bottomMode === 'problems' && <div className="problems-list">{problems.length ? problems.slice(0, 200).map((p, i) => <button key={i} onClick={() => { const file = [...models].find(([, m]) => m.uri.toString() === p.resource.toString())?.[0]; if (file) void openFile(file, p.startLineNumber, p.startColumn); }}>{p.severity === monaco.MarkerSeverity.Error ? <CircleX size={14} className="error-color"/> : <TriangleAlert size={14} className="warning-text"/>}<span>{privateText(p.message)}</span><small>{basename(p.resource.path)}:{p.startLineNumber}</small></button>) : <div className="terminal-empty"><Check size={22}/><span>열린 파일에서 발견된 문제가 없습니다.</span></div>}</div>}</div></section>
    </main><AIPanel visible={aiOpen} root={workspace?.root} getContext={aiContext} onClose={()=>setAiOpen(false)} onLoginTerminal={async id=>{const t=await window.luma.terminalCreate({aiProvider:id});setTerminals(ts=>[...ts,t]);setActiveTerminal(t.id);setBottomMode('terminal');setBottomVisible(true);}} onApplied={result=>{baseline.current.set(result.path,result.content);models.get(result.path)?.setValue(result.content);setTabs(ts=>ts.map(t=>t.path===result.path?{...t,mtime:result.mtime,bom:result.bom,dirty:false}:t));setRevision(n=>n+1);notify(result.path+' · AI 수정안 적용됨');void openFile(result.path);}}/></div>
    <footer className="statusbar"><button className={`remote-status ${workspace?.remote ? 'connected' : ''}`} title="SSH 원격 연결" onClick={() => setSSHOpen(true)}><ChevronRight size={14}/><ChevronRight size={14}/>{workspace?.remote && <span>SSH: {workspace.host}</span>}</button><button className="status-workspace" title={workspace?.root} onClick={() => workspace ? openSpecial('$map') : openFolder()}>{workspace ? <><FolderOpen size={12}/>{workspace.name}</> : '로컬 작업 공간'}</button><button title="문제 패널" onClick={() => { setBottomMode('problems'); setBottomVisible(v => !v || bottomMode !== 'problems'); }}><CircleX size={12}/>{errorCount}<TriangleAlert size={12}/>{warningCount}</button><div className="status-message">{indexing ? <><LoaderCircle size={11} className="spin"/>프로젝트 인덱싱 중</> : workspace && <><Check size={11}/>{workspace.remote ? 'SSH 연결됨' : '준비됨'}</>}</div><div className="status-right">{activeTab && <><span>줄 {position.line}, 열 {position.column}</span><button title="편집기 설정" onClick={() => openSpecial('$settings')}>공백: {theme.tabSize}</button><span>UTF-8</span><span>{models.get(active)?.getEOL() === '\r\n' ? 'CRLF' : 'LF'}</span><span>{activeTab.language === 'typescript' ? 'TypeScript' : activeTab.language === 'javascript' ? 'JavaScript' : activeTab.language === 'python' ? 'Python' : activeTab.language}</span></>}<IconButton title="최근 알림" onClick={() => notify(workspace ? `${workspace.name} · ${workspace.count}개 항목${runtime?.python ? ' · Python 감지됨' : ''}${runtime?.node ? ' · Node.js 감지됨' : ''}${runtime?.powershell ? ' · PowerShell 감지됨' : ''}` : '폴더를 열어 시작하세요.')}><Bell size={12}/></IconButton></div></footer>
    {toast && <div className={`toast ${toast.error ? 'error' : ''}`} role={toast.error ? 'alert' : 'status'}>{toast.error ? <TriangleAlert size={17}/> : <Check size={17}/>}<span>{toast.message}</span><IconButton title="알림 닫기" onClick={() => setToast(undefined)}><X size={14}/></IconButton></div>}
    {palette && <Modal title={palette === 'files' ? '빠른 파일 열기' : '명령 팔레트'} onClose={() => setPalette('')} wide><div className="palette-input"><Search size={18}/><input aria-label="명령 또는 파일 검색" autoFocus value={paletteQuery} placeholder={palette === 'files' ? '이름으로 파일 검색…' : '실행할 명령 검색…'} onChange={e => { setPaletteQuery(e.target.value); setPaletteIndex(0); }} onKeyDown={e => { if (e.key === 'ArrowDown') { e.preventDefault(); setPaletteIndex(i => Math.min(paletteItems.length - 1, i + 1)); } if (e.key === 'ArrowUp') { e.preventDefault(); setPaletteIndex(i => Math.max(0, i - 1)); } if (e.key === 'Enter' && paletteItems[paletteIndex]) { setPalette(''); void paletteItems[paletteIndex].action(); } }}/><kbd>ESC</kbd></div><div className="palette-results">{paletteItems.length ? paletteItems.map((item, i) => <button className={i === paletteIndex ? 'selected' : ''} key={item.id} onMouseEnter={() => setPaletteIndex(i)} onClick={() => { setPalette(''); void item.action(); }}>{item.file ? <FileIcon path={item.file}/> : <Command size={15}/>}<div><b>{item.title}</b><span>{item.detail}</span></div>{item.shortcut ? <kbd>{item.shortcut}</kbd> : <ArrowUpRight size={14}/>}</button>) : <p className="sidebar-hint">{palette === 'files' && !workspace ? '먼저 작업 폴더를 열어주세요.' : '일치하는 항목이 없습니다.'}</p>}</div><div className="palette-footer"><span>↑ ↓ 이동</span><span>↵ 실행</span></div></Modal>}
    {sshOpen && <SSHDialog profiles={config.profiles} onConnect={connectSSH} onClose={() => setSSHOpen(false)}/>}
    {pathDialog && <Modal title={pathDialog.kind === 'rename' ? '이름 변경' : pathDialog.kind === 'folder' ? '새 폴더' : '새 파일'} onClose={() => setPathDialog(undefined)}><form onSubmit={e => { e.preventDefault(); void submitPath(); }}><label className="form-field">작업 폴더 기준 경로<input autoFocus aria-label="파일 또는 폴더 경로" required value={pathDialog.value} placeholder={pathDialog.kind === 'folder' ? '새 폴더 이름' : 'src/example.ts'} onChange={e => setPathDialog(d => d ? { ...d, value: e.target.value } : d)}/></label><p className="form-note">상위 폴더가 있는 경로를 입력하세요.</p>{pathError && <div className="form-error">{pathError}</div>}<div className="modal-footer"><button type="button" className="button secondary" onClick={() => setPathDialog(undefined)}>취소</button><button className="button primary">{pathDialog.kind === 'rename' ? '변경' : '만들기'}</button></div></form></Modal>}
    {helpOpen && <Modal title="키보드 단축키" onClose={() => setHelpOpen(false)}><div className="shortcut-list">{[['파일 열기', 'Ctrl + O'], ['폴더 열기', 'Ctrl + Shift + O'], ['파일 빠르게 열기', 'Ctrl + P'], ['명령 팔레트', 'Ctrl + Shift + P'], ['현재 파일 저장', 'Ctrl + S'], ['모두 저장', 'Ctrl + Alt + S'], ['현재 파일 실행', 'F5'], ['자동 완성 제안', 'Ctrl + Space'], ['프로젝트 구조', 'Ctrl + Shift + G'], ['프로젝트 검색', 'Ctrl + Shift + F'], ['현재 파일 찾기 / 바꾸기', 'Ctrl + F / Ctrl + H'], ['터미널 표시 / 숨기기', 'Ctrl + `'], ['사이드바 표시 / 숨기기', 'Ctrl + B'], ['환경 설정', 'Ctrl + ,'], ['탭 닫기', 'Ctrl + W']].map(([title, key]) => <div key={title}><span>{title}</span><kbd>{key}</kbd></div>)}</div><p className="form-note">JavaScript / TypeScript: IntelliSense · 로컬 Python: Pyright · PowerShell: 명령어 및 스니펫. VS Code 확장 프로그램 호스트는 포함하지 않습니다.</p></Modal>}
    {context && <div className="dropdown context-menu" style={{ left: Math.min(context.x, window.innerWidth - 225), top: Math.min(context.y, window.innerHeight - 200) }} onClick={e => e.stopPropagation()}>{context.entry.kind === 'directory' && <><button onClick={() => showPathDialog('file', context.entry.path + '/')}><FilePlus2 size={14}/>새 파일</button><button onClick={() => showPathDialog('folder', context.entry.path + '/')}><FolderPlus size={14}/>새 폴더</button></>}<button onClick={() => showPathDialog('rename', context.entry.path, context.entry.path)}>이름 변경</button><button onClick={() => { void window.luma.copyText(context.entry.path); setContext(undefined); }}>상대 경로 복사</button>{!workspace?.remote && <button className="danger-text" onClick={() => { void trashEntry(context.entry); setContext(undefined); }}><Trash2 size={14}/>휴지통으로 이동</button>}</div>}
  </div>;
}
