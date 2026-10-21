const { contextBridge, ipcRenderer } = require('electron');
const invoke = name => (...args) => ipcRenderer.invoke(name, ...args);
const on = name => callback => { const handler = (_event, value) => callback(value); ipcRenderer.on(name, handler); return () => ipcRenderer.removeListener(name, handler); };
contextBridge.exposeInMainWorld('luma', {
  installCatalog: invoke('install:catalog'), installStatus: invoke('install:status'), installLanguages: invoke('install:start'), openLanguageSite: invoke('install:site'), onInstall: on('install:changed'),
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
