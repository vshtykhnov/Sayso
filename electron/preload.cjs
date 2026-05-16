const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('miljenTts', {
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  startServer: (settings) => ipcRenderer.invoke('server:start', settings),
  stopServer: () => ipcRenderer.invoke('server:stop'),
  testMessage: () => ipcRenderer.invoke('server:testMessage'),
  updateTtsSettings: (settings) => ipcRenderer.invoke('server:updateTtsSettings', settings),
  loginWithTwitch: (settings) => ipcRenderer.invoke('twitch:login', settings),
  validateTwitchToken: (settings) => ipcRenderer.invoke('twitch:validateToken', settings),
  listTtsEngines: () => ipcRenderer.invoke('tts:listEngines'),
  listTtsVoices: (settings) => ipcRenderer.invoke('tts:listVoices', settings),
  testVoice: (settings) => ipcRenderer.invoke('tts:testVoice', settings),
  copyText: (text) => ipcRenderer.invoke('clipboard:writeText', text),
  openExternal: (url) => ipcRenderer.invoke('external:open', url),
  openLogs: () => ipcRenderer.invoke('logs:open'),
  onServerStatus: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('server:status', listener);
    return () => ipcRenderer.removeListener('server:status', listener);
  }
});
