export interface Entry { name: string; path: string; kind: 'file' | 'directory'; children?: Entry[]; inaccessible?: boolean }
export interface Workspace { root: string; name: string; remote: boolean; host: string; tree: Entry[]; count: number; truncated: boolean; filesOnly?: boolean }
export interface FileData { content: string; mtime: number; bom: boolean; language: string }
export interface Source extends FileData { path: string }
export interface SymbolInfo { name: string; kind: string; line: number }
export interface GraphData { modules: { path: string; imports: string[]; symbols: SymbolInfo[] }[]; edges: { source: string; target: string }[]; truncated: boolean; total: number }
export interface Theme { preset: string; accent: string; background: string; image: string; opacity: number; blur: number; fontSize: number; fontFamily: string; minimap: boolean; wordWrap: boolean; tabSize: number; autoSave: boolean; openAnimation: boolean; animationDuration: number; soundEnabled: boolean; soundVolume: number; clickSound: 'tock' | 'click' | 'soft'; typingSound: boolean }
export interface Profile { host: string; port: number; username: string; folder: string; keyPath: string; password?: string; passphrase?: string }
export interface Config { privacy?: {mode: PrivacyStatus['mode']}; theme: Theme; recent: string[]; recentFiles?: string[]; profiles: Profile[] }
export interface Tab { path: string; name: string; dirty: boolean; mtime: number; bom: boolean; language: string }
export interface TerminalInfo { id: string; name: string; run: boolean; exited?: boolean; code?: number }
export interface Match { path: string; line: number; column: number; text: string }
export interface RuntimeItem { id: string; name: string; extensions: string[]; path: string; version: string; source: string; valid: boolean; ready: boolean; issue?: string; custom?: boolean }
export interface RuntimeInput { id?: string; path: string; custom?: { id?: string; name: string; extensions: string; args: string; versionArgs: string } }
export interface Runtime { items?: RuntimeItem[]; checkedAt?: string; python?: string | null; node?: string | null; powershell?: string | null; typescript?: string | null; remote?: boolean }
export interface PrivacyStatus {mode:'always'|'auto'|'off';active:boolean;clients:string[];detecting:boolean;changed?:boolean}
export interface InstallLanguage {id:string;name:string;installable:boolean;alias?:string;site:string;note?:string}
export interface InstallJob {running:boolean;finishedAt?:string|null;logs:string[];items:{id:string;name:string;status:'queued'|'installing'|'done'|'error';error?:string;upToDate?:boolean}[]}
export interface PresenceOptions { enabled:boolean;applicationId:string;showProject:boolean;showFile:boolean;showPosition:boolean;showMouse:boolean;hideSensitive:boolean;pipe:string }
export interface PresenceActivity {details:string;state:string;assets:{large_image:string;large_text:string}}
export interface PresenceStatus {options:PresenceOptions;status:'disabled'|'connecting'|'waiting'|'connected'|'error';error:string;preview:PresenceActivity;lastActivity:PresenceActivity|null}
interface API {
  presenceStatus():Promise<PresenceStatus>;setPresence(patch:Partial<PresenceOptions>):Promise<PresenceStatus>;presenceUpdate(meta:Record<string,unknown>):Promise<PresenceStatus>;onPresence(fn:(state:PresenceStatus)=>void):()=>void;
  installCatalog():Promise<InstallLanguage[]>;installStatus():Promise<InstallJob>;installLanguages(ids:string[]):Promise<boolean>;openLanguageSite(id:string):Promise<void>;onInstall(fn:(job:InstallJob)=>void):()=>void;
  privacyStatus():Promise<PrivacyStatus>;setPrivacy(mode:PrivacyStatus['mode']):Promise<PrivacyStatus>;onPrivacy(fn:(status:PrivacyStatus)=>void):()=>void;
  copyText(text: string): Promise<void>;
  bootstrap(): Promise<{ config: Config; version: string; platform: string; initialFolder: string | null }>;
  chooseFolder(): Promise<string | null>; openFolder(path: string): Promise<Workspace>; refresh(): Promise<Workspace>;
  chooseFile(): Promise<string | null>; openPickedFile(path: string): Promise<{ workspace: Workspace; path: string; sameWorkspace: boolean }>;
  readFile(path: string): Promise<FileData>; writeFile(path: string, content: string, expected: number | null, bom: boolean): Promise<FileData>;
  create(path: string, directory: boolean): Promise<Workspace>; rename(path: string, target: string): Promise<Workspace>; trash(path: string): Promise<Workspace>;
  sources(): Promise<{ files: Source[]; truncated: boolean; total: number }>; graph(): Promise<GraphData>;
  search(query: string, sensitive?: boolean): Promise<{ matches: Match[]; truncated: boolean }>;
  settings(patch: Partial<Config>): Promise<Config>; chooseImage(): Promise<string | null>; chooseKey(): Promise<string | null>;
  connect(profile: Profile): Promise<Workspace>; disconnect(): Promise<boolean>; runtimes(refresh?: boolean): Promise<Runtime>; chooseRuntime(directory?: boolean): Promise<string | null>; saveRuntime(input: RuntimeInput): Promise<Runtime>; resetRuntime(id: string): Promise<Runtime>;
  terminalCreate(options?: { runPath?: string; cols?: number; rows?: number }): Promise<TerminalInfo>;
  terminalWrite(id: string, data: string): Promise<void>; terminalResize(id: string, cols: number, rows: number): Promise<void>; terminalClose(id: string): Promise<void>;
  python(method: string, params: unknown): Promise<any>; pythonNotify(method: string, params: unknown): Promise<void>;
  window(action: string): Promise<void>; confirm(message: string, detail?: string, buttons?: string[]): Promise<number>;
  onTerminal(fn: (data: { id: string; data: string }) => void): () => void;
  onTerminalExit(fn: (data: { id: string; code: number }) => void): () => void;
  onFiles(fn: (data: { path: string }) => void): () => void;
  onDisconnect(fn: (data: { message: string }) => void): () => void;
  onDiagnostics(fn: (data: any) => void): () => void;
  onMenu(fn: (action: string) => void): () => void;
}
declare global { interface Window { luma: API } }
