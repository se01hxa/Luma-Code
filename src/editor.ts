import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker';
import TsWorker from 'monaco-editor/language/typescript/ts.worker.js?worker';
import JsonWorker from 'monaco-editor/language/json/json.worker.js?worker';
import CssWorker from 'monaco-editor/language/css/css.worker.js?worker';
import HtmlWorker from 'monaco-editor/language/html/html.worker.js?worker';
import { rememberSecrets } from './privacy';
import type { Source, Theme, Workspace } from './types';

(self as any).MonacoEnvironment = { getWorker(_id: string, label: string) { return ['typescript', 'javascript'].includes(label) ? new TsWorker() : label === 'json' ? new JsonWorker() : ['css', 'scss', 'less'].includes(label) ? new CssWorker() : ['html', 'handlebars', 'razor'].includes(label) ? new HtmlWorker() : new EditorWorker(); } };

export const models = new Map<string, monaco.editor.ITextModel>();
let currentWorkspace: Workspace | undefined;
const pythonVersions = new Map<string, number>();
const pythonQueue = new Map<string, Promise<void>>();
export const languageOf = (p: string): string => ({ ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript', js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript', py: 'python', ps1: 'powershell', psm1: 'powershell', jsonc: 'json', md: 'markdown', yml: 'yaml', sh: 'shell', rs: 'rust', cs: 'csharp', kt: 'kotlin', kts: 'kotlin', fsx: 'fsharp', rb: 'ruby', jl: 'julia', r: 'r', hs: 'haskell', pl: 'perl', ex: 'elixir', exs: 'elixir', cc: 'cpp', cxx: 'cpp', ml: 'ocaml', sc: 'scala' } as Record<string, string>)[p.split('.').pop() || ''] || p.split('.').pop() || 'plaintext';
export const uriFor = (p: string) => monaco.Uri.file((currentWorkspace?.remote ? '/__luma_remote__/' + currentWorkspace.host + currentWorkspace.root : currentWorkspace?.root || '/untitled') + '/' + p);
export function resetModels(workspace: Workspace) {
  for (const model of models.values()) model.dispose();
  models.clear(); pythonVersions.clear(); pythonQueue.clear(); currentWorkspace = workspace;
}
export function ensureModel(p: string, content: string, language?: string) {
  rememberSecrets(p,content);
  let model = models.get(p);
  if (!model) { model = monaco.editor.createModel(content, language || languageOf(p), uriFor(p)); models.set(p, model); }
  return model;
}
export function seedModels(files: Source[], preserve = new Set<string>()) {
  files.forEach(f => {
    if (!['typescript', 'javascript', 'json'].includes(f.language) || preserve.has(f.path)) return;
    const model = ensureModel(f.path, f.content, f.language);
    if (model.getValue() !== f.content) model.setValue(f.content);
  });
}
export function defineTheme(theme: Theme) {
  const light = theme.preset === 'paper';
  monaco.editor.defineTheme('luma', {
    base: light ? 'vs' : 'vs-dark', inherit: true,
    rules: light ? [ { token: 'comment', foreground: '89918e', fontStyle: 'italic' }, { token: 'keyword', foreground: '8b51ad' } ] : [
      { token: 'comment', foreground: '686f7b', fontStyle: 'italic' }, { token: 'keyword', foreground: 'c4a0e8' },
      { token: 'string', foreground: 'b5cea8' }, { token: 'number', foreground: 'e5b88b' },
      { token: 'type.identifier', foreground: '8ecfc1' }, { token: 'identifier', foreground: 'd8dde7' },
    ],
    colors: { 'editor.background': '#00000000', 'editor.foreground': light ? '#343e40' : '#d6dbe6', 'editorLineNumber.foreground': light ? '#a3ada8' : '#4e5563', 'editorLineNumber.activeForeground': theme.accent, 'editor.selectionBackground': light ? '#b8d5c980' : '#58647b60', 'editor.inactiveSelectionBackground': '#58647b30', 'editor.lineHighlightBackground': light ? '#00000005' : '#ffffff03', 'editorCursor.foreground': theme.accent, 'editorIndentGuide.background1': light ? '#0000000d' : '#ffffff08', 'editorIndentGuide.activeBackground1': light ? '#00000025' : '#ffffff19', 'editorWidget.background': light ? '#f5f7f5' : '#22262e', 'editorWidget.border': light ? '#cdd5d0' : '#343b47', 'editorSuggestWidget.background': light ? '#f7f9f7' : '#21252c', 'editorSuggestWidget.border': light ? '#d0d9d3' : '#343b47', 'editorSuggestWidget.selectedBackground': light ? '#d6e9df' : '#343f48', 'editorHoverWidget.background': light ? '#f7f9f7' : '#21252c', 'editorHoverWidget.border': light ? '#d0d9d3' : '#343b47', 'scrollbarSlider.background': '#7a829422', 'scrollbarSlider.hoverBackground': '#7a829444', 'editorGutter.background': '#00000000', 'editorOverviewRuler.border': '#00000000', 'minimap.background': '#00000000' },
  });
  monaco.editor.setTheme('luma');
}

const compiler = { target: monaco.typescript.ScriptTarget.ESNext, module: monaco.typescript.ModuleKind.ESNext, moduleResolution: monaco.typescript.ModuleResolutionKind.NodeJs, jsx: monaco.typescript.JsxEmit.ReactJSX, allowJs: true, allowNonTsExtensions: true, esModuleInterop: true, noEmit: true, strict: true, skipLibCheck: true };
for (const defaults of [monaco.typescript.typescriptDefaults, monaco.typescript.javascriptDefaults]) {
  defaults.setCompilerOptions(compiler);
  defaults.setEagerModelSync(true);
}
monaco.typescript.javascriptDefaults.setDiagnosticsOptions({ noSemanticValidation: true, noSyntaxValidation: false });

async function syncPython(model: monaco.editor.ITextModel) {
  if (currentWorkspace?.remote) throw Error('remote');
  const uri = model.uri.toString(), version = model.getVersionId(), text = model.getValue();
  const next = (pythonQueue.get(uri) || Promise.resolve()).catch(() => {}).then(async () => {
    if (pythonVersions.get(uri) === version) return;
    if (!pythonVersions.has(uri)) await window.luma.pythonNotify('textDocument/didOpen', { textDocument: { uri, languageId: 'python', version, text } });
    else await window.luma.pythonNotify('textDocument/didChange', { textDocument: { uri, version }, contentChanges: [{ text }] });
    pythonVersions.set(uri, version);
  });
  pythonQueue.set(uri, next); return next;
}
export function schedulePython(model: monaco.editor.ITextModel) { if (model.getLanguageId() === 'python' && !currentWorkspace?.remote) void syncPython(model).catch(() => {}); }
const lspPos = (position: monaco.Position) => ({ line: position.lineNumber - 1, character: position.column - 1 });
const rangeFrom = (r: any) => new monaco.Range(r.start.line + 1, r.start.character + 1, r.end.line + 1, r.end.character + 1);
const completionKinds: Record<number, monaco.languages.CompletionItemKind> = { 1: 18, 2: 0, 3: 1, 4: 2, 5: 3, 6: 4, 7: 5, 8: 7, 9: 8, 10: 9, 12: 13, 14: 17, 15: 27, 17: 20, 21: 14, 22: 6, 25: 24 };
monaco.languages.registerCompletionItemProvider('python', {
  triggerCharacters: ['.'],
  async provideCompletionItems(model, position) {
    try {
      await syncPython(model);
      const result = await window.luma.python('textDocument/completion', { textDocument: { uri: model.uri.toString() }, position: lspPos(position) });
      const word = model.getWordUntilPosition(position), range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
      return { suggestions: (Array.isArray(result) ? result : result?.items || []).map((item: any) => ({ label: item.label, kind: completionKinds[item.kind] ?? monaco.languages.CompletionItemKind.Text, insertText: item.textEdit?.newText || item.insertText || item.label, insertTextRules: item.insertTextFormat === 2 ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet : undefined, detail: item.detail, documentation: typeof item.documentation === 'string' ? item.documentation : item.documentation?.value, range: item.textEdit?.range ? rangeFrom(item.textEdit.range) : range, sortText: item.sortText, filterText: item.filterText })) };
    } catch { return { suggestions: [] }; }
  },
});
monaco.languages.registerHoverProvider('python', { async provideHover(model, position) {
  try { await syncPython(model); const result = await window.luma.python('textDocument/hover', { textDocument: { uri: model.uri.toString() }, position: lspPos(position) }); return result ? { range: result.range ? rangeFrom(result.range) : undefined, contents: (Array.isArray(result.contents) ? result.contents : [result.contents]).map((c: any) => ({ value: typeof c === 'string' ? c : c.value })) } : null; } catch { return null; }
} });
monaco.languages.registerDefinitionProvider('python', { async provideDefinition(model, position) {
  try { await syncPython(model); const result = await window.luma.python('textDocument/definition', { textDocument: { uri: model.uri.toString() }, position: lspPos(position) }); return (Array.isArray(result) ? result : result ? [result] : []).filter((r: any) => monaco.editor.getModel(monaco.Uri.parse(r.uri || r.targetUri))).map((r: any) => ({ uri: monaco.Uri.parse(r.uri || r.targetUri), range: rangeFrom(r.range || r.targetSelectionRange) })); } catch { return []; }
} });
window.luma.onDiagnostics(params => {
  const model = monaco.editor.getModel(monaco.Uri.parse(params.uri));
  if (!model || (params.version !== undefined && params.version < model.getVersionId())) return;
  monaco.editor.setModelMarkers(model, 'pyright', params.diagnostics.map((d: any) => ({ ...rangeFrom(d.range), message: d.message, severity: d.severity === 1 ? monaco.MarkerSeverity.Error : d.severity === 2 ? monaco.MarkerSeverity.Warning : monaco.MarkerSeverity.Info, source: 'Pyright', code: String(d.code || '') })));
});

const snippets: Record<string, [string, string, string][]> = {
  python: [['def', 'def ${1:name}(${2:args}):\n\t${0:pass}', '함수'], ['class', 'class ${1:Name}:\n\tdef __init__(self${2:}):\n\t\t${0:pass}', '클래스'], ['main', 'if __name__ == "__main__":\n\t${0:main()}', '진입점'], ['for', 'for ${1:item} in ${2:items}:\n\t${0:pass}', '반복문'], ['try', 'try:\n\t${1:pass}\nexcept ${2:Exception} as e:\n\t${0:print(e)}', '예외 처리']],
  powershell: [['function', 'function ${1:Verb-Noun} {\n\tparam(${2:})\n\t${0:}\n}', '함수'], ['foreach', 'foreach ($${1:item} in $${2:items}) {\n\t${0:}\n}', '반복문'], ['param', 'param(\n\t[Parameter(Mandatory)]\n\t[string]$${1:Name}\n)', '매개 변수'], ['try', 'try {\n\t${1:}\n} catch {\n\tWrite-Error $_\n}', '예외 처리'], ...['Write-Host', 'Write-Output', 'Get-ChildItem', 'Get-Content', 'Set-Content', 'Get-Process', 'Get-Command', 'Where-Object', 'ForEach-Object', 'Select-Object', 'Test-Path', 'Join-Path', 'Invoke-RestMethod', 'Import-Module'].map(s => [s, s, 'PowerShell 명령'] as [string, string, string])],
};
for (const language of Object.keys(snippets)) monaco.languages.registerCompletionItemProvider(language, { provideCompletionItems(model, position) {
  const word = model.getWordUntilPosition(position), range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
  return { suggestions: snippets[language].map(([label, insertText, detail]) => ({ label, insertText, detail, range, kind: monaco.languages.CompletionItemKind.Snippet, insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet })) };
} });
export { monaco };
