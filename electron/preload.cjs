const { contextBridge, ipcRenderer } = require('electron');
const invoke = name => (...args) => ipcRenderer.invoke(name, ...args);
const on = name => callback => { const handler = (_event, value) => callback(value); ipcRenderer.on(name, handler); return () => ipcRenderer.removeListener(name, handler); };
contextBridge.exposeInMainWorld('luma', {
  installCatalog: invoke('install:catalog'), installStatus: invoke('install:status'), installLanguages: invoke('install:start'), openLanguageSite: invoke('install:site'), onInstall: on('install:changed'),
  aiSelect:invoke('ai:select'),aiStatus:invoke('ai:status'),aiRefresh:invoke('ai:refresh'),aiContext:invoke('ai:context'),aiAsk:invoke('ai:ask'),aiCancel:invoke('ai:cancel'),aiApproval:invoke('ai:approval'),aiOptions:invoke('ai:options'),aiCodexInfo:invoke('ai:codex-info'),aiConfig:invoke('ai:config'),aiApply:invoke('ai:apply'),aiReject:invoke('ai:reject'),aiBridge:invoke('ai:bridge'),aiPick:invoke('ai:pick'),aiSite:invoke('ai:site'),aiLogin:invoke('ai:login'),onAI:on('ai:changed'),onAIOpen:on('ai:open'),onAILogin:on('ai:login'),
  presenceStatus: invoke('presence:status'), setPresence: invoke('presence:set'), presenceUpdate: invoke('presence:update'), onPresence: on('presence:changed'),
  privacyStatus: invoke('privacy:status'), setPrivacy: invoke('privacy:set'), onPrivacy: on('privacy:changed'),
  bootstrap: invoke('bootstrap'), chooseFolder: invoke('workspace:choose'), openFolder: invoke('workspace:open'), refresh: invoke('workspace:refresh'),
  chooseFile: invoke('file:choose'), openPickedFile: invoke('file:open'),
  copyText: invoke('clipboard:write'),
  readFile: invoke('file:read'), writeFile: invoke('file:write'), create: invoke('file:create'), rename: invoke('file:rename'), trash: invoke('file:trash'),
  sources: invoke('workspace:sources'), graph: invoke('workspace:graph'), search: invoke('workspace:search'),
  settings: invoke('settings:save'), chooseImage: invoke('theme:image'), chooseKey: invoke('ssh:key'),
  connect: invoke('ssh:connect'), disconnect: invoke('ssh:disconnect'), runtimes: invoke('runtime:list'), chooseRuntime: invoke('runtime:choose'), saveRuntime: invoke('runtime:save'), resetRuntime: invoke('runtime:reset'),
  terminalCreate: invoke('terminal:create'), terminalWrite: invoke('terminal:write'), terminalResize: invoke('terminal:resize'), terminalClose: invoke('terminal:close'),
  python: invoke('python:request'), pythonNotify: invoke('python:notify'),
  window: invoke('window:action'), confirm: invoke('dialog:confirm'),
  onTerminal: on('terminal:data'), onTerminalExit: on('terminal:exit'), onFiles: on('workspace:changed'),
  onDisconnect: on('ssh:closed'), onDiagnostics: on('python:diagnostics'), onMenu: on('menu:action'),
});
