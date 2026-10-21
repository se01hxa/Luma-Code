import { FileCode2 } from 'lucide-react';
const files = import.meta.glob('../assets/languages/*.svg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const icons = Object.fromEntries(Object.entries(files).map(([p, url]) => [p.split('/').pop()!.replace('.svg', ''), url]));
const extensions: Record<string, string> = { py:'python',pyw:'python',js:'javascript',mjs:'javascript',cjs:'javascript',ts:'typescript',mts:'typescript',cts:'typescript',tsx:'react',jsx:'react',ps1:'powershell',psm1:'powershell',kt:'kotlin',kts:'kotlin',java:'java',c:'c',h:'c',cpp:'cpp',cc:'cpp',cxx:'cpp',hpp:'cpp',rs:'rust',go:'go',cs:'dotnet',fs:'fsharp',fsx:'fsharp',rb:'ruby',php:'php',lua:'lua',pl:'perl',r:'r',jl:'julia',dart:'dart',swift:'swift',sh:'bash',bash:'bash',hs:'haskell',nim:'nim',zig:'zig',ml:'ocaml',rkt:'racket',ex:'elixir',exs:'elixir',groovy:'groovy',scala:'scala',sc:'scala',html:'html',htm:'html',css:'css',scss:'css',json:'json',jsonc:'json',md:'markdown',yml:'yaml',yaml:'yaml',sql:'sql',vue:'vue',svelte:'svelte' };
export default function LanguageIcon({ id, file, size=20 }: { id?: string; file?: string; size?: number }) {
  const name=file?.split(/[\\/]/).pop()?.toLowerCase() || '', ext=name.split('.').pop() || '';
  const key=id || (name==='dockerfile'?'docker':name.startsWith('.git')?'git':extensions[ext]);
  return icons[key] ? <img className={`language-icon language-${key}`} src={icons[key]} width={size} height={size} alt="" aria-hidden="true"/> : <FileCode2 size={size} className="file-icon" strokeWidth={1.6}/>;
}
