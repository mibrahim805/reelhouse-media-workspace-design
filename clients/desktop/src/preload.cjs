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
  navigateBack: () => ipcRenderer.invoke('reelhouse:navigate-back'),
  navigateForward: () => ipcRenderer.invoke('reelhouse:navigate-forward'),
  localDownload: (input) => ipcRenderer.invoke('reelhouse:local-download', input),
  setServerUrl: (value) =>
    ipcRenderer.invoke('reelhouse:set-server-url', value),
})
