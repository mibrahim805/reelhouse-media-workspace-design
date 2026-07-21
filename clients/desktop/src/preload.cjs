const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('reelhouseDesktop', {
  getConfig: () => ipcRenderer.invoke('reelhouse:get-config'),
  onDownloadState: (listener) => {
    const handler = (_event, payload) => listener(payload)
    ipcRenderer.on('reelhouse:download-state', handler)
    return () => ipcRenderer.removeListener('reelhouse:download-state', handler)
  },
  openDownloads: () => ipcRenderer.invoke('reelhouse:open-downloads'),
  openSettings: () => ipcRenderer.invoke('reelhouse:settings'),
  retry: () => ipcRenderer.invoke('reelhouse:retry'),
  setServerUrl: (value) =>
    ipcRenderer.invoke('reelhouse:set-server-url', value),
})
