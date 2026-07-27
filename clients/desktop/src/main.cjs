const {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  Notification,
  session,
  shell,
} = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const DEFAULT_SERVER_URL =
  process.env.REELHOUSE_SERVER_URL ||
  'https://reelhouse-media-workspace-design-production.up.railway.app'
const LEGACY_SERVER_URLS = new Set([
  'https://pajamas-hexagon-equation.ngrok-free.dev',
])

let mainWindow = null

function configFile() {
  return path.join(app.getPath('userData'), 'config.json')
}

function normalizeServerUrl(value) {
  const parsed = new URL(String(value || '').trim())

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('The server URL must start with http:// or https://.')
  }

  if (parsed.username || parsed.password) {
    throw new Error('Do not include a username or password in the server URL.')
  }

  parsed.hash = ''
  parsed.search = ''
  parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/'
  return parsed.toString().replace(/\/$/, '')
}

function commandLineServerUrl() {
  const argument = process.argv.find((value) =>
    value.startsWith('--server-url='),
  )
  return argument?.slice('--server-url='.length)
}

function readServerUrl() {
  const override = commandLineServerUrl() || process.env.REELHOUSE_SERVER_URL
  if (override) return normalizeServerUrl(override)

  try {
    const config = JSON.parse(fs.readFileSync(configFile(), 'utf8'))
    if (config.serverUrl) {
      const configuredUrl = normalizeServerUrl(config.serverUrl)
      if (!LEGACY_SERVER_URLS.has(configuredUrl)) return configuredUrl
    }
  } catch {
    // Missing or invalid user config falls back to the packaged default.
  }

  return normalizeServerUrl(DEFAULT_SERVER_URL)
}

function writeServerUrl(value) {
  const serverUrl = normalizeServerUrl(value)
  fs.mkdirSync(path.dirname(configFile()), { recursive: true })
  fs.writeFileSync(configFile(), `${JSON.stringify({ serverUrl }, null, 2)}\n`)
  return serverUrl
}

function downloadsDirectory() {
  return path.join(app.getPath('downloads'), 'Reelhouse')
}

function openDownloadsDirectory() {
  const directory = downloadsDirectory()
  fs.mkdirSync(directory, { recursive: true })
  return shell.openPath(directory)
}

function safeFilename(value) {
  const basename = path.basename(value || 'video.mp4')
  const cleaned = basename
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/[. ]+$/g, '')
    .trim()

  return cleaned || 'video.mp4'
}

function availableSavePath(directory, originalName) {
  const filename = safeFilename(originalName)
  const extension = path.extname(filename)
  const stem = path.basename(filename, extension)
  let candidate = path.join(directory, filename)
  let counter = 1

  while (fs.existsSync(candidate)) {
    candidate = path.join(directory, `${stem} (${counter})${extension}`)
    counter += 1
  }

  return candidate
}

function isMediaMimeType(value) {
  const mimeType = String(value || '')
    .split(';', 1)[0]
    .trim()
    .toLowerCase()

  return (
    mimeType.startsWith('video/') ||
    mimeType.startsWith('audio/') ||
    mimeType === 'application/octet-stream' ||
    mimeType === 'application/force-download'
  )
}

function isMediaDownload(item) {
  try {
    const serverUrl = new URL(readServerUrl())
    const serverBase = `${serverUrl.toString().replace(/\/+$/, '')}/`
    const downloadUrl = new URL(item.getURL(), serverBase)
    const basePath = serverUrl.pathname.replace(/\/$/, '')
    const knownMediaPaths = [
      '/api/backend/media/',
      '/media/',
      `${basePath}/api/backend/media/`,
      `${basePath}/media/`,
    ]
    const contentDisposition = String(item.getContentDisposition() || '')
      .toLowerCase()
    const sameOrigin =
      downloadUrl.origin === serverUrl.origin &&
      !downloadUrl.username &&
      !downloadUrl.password

    return (
      sameOrigin &&
      (knownMediaPaths.some((prefix) => downloadUrl.pathname.startsWith(prefix)) ||
        contentDisposition.includes('attachment') ||
        isMediaMimeType(item.getMimeType()))
    )
  } catch {
    return false
  }
}

function sendDownloadState(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('reelhouse:download-state', payload)
  }
}

function configureNativeDownloads() {
  session.defaultSession.on('will-download', (event, item) => {
    if (!isMediaDownload(item)) {
      event.preventDefault()
      return
    }

    const directory = downloadsDirectory()
    fs.mkdirSync(directory, { recursive: true })
    const savePath = availableSavePath(directory, item.getFilename())
    item.setSavePath(savePath)

    sendDownloadState({
      state: 'started',
      filename: path.basename(savePath),
      path: savePath,
    })

    item.on('done', (_event, state) => {
      sendDownloadState({
        state,
        filename: path.basename(savePath),
        path: savePath,
      })

      if (state === 'completed' && Notification.isSupported()) {
        const notification = new Notification({
          title: 'Saved to your device',
          body: path.basename(savePath),
        })
        notification.on('click', () => shell.showItemInFolder(savePath))
        notification.show()
      }
    })
  })
}

function isTrustedNavigation(rawUrl) {
  try {
    const target = new URL(rawUrl)
    const server = new URL(readServerUrl())
    return target.origin === server.origin || target.protocol === 'file:'
  } catch {
    return false
  }
}

function openExternalHttp(rawUrl) {
  try {
    const target = new URL(rawUrl)
    if (!['http:', 'https:'].includes(target.protocol)) return
    void shell.openExternal(target.toString())
  } catch {
    // Ignore malformed URLs instead of letting a renderer navigation throw.
  }
}

function loadReelhouse() {
  return mainWindow?.loadURL(readServerUrl())
}

function loadSettings() {
  return mainWindow?.loadFile(path.join(__dirname, 'settings.html'))
}

function createMenu() {
  return Menu.buildFromTemplate([
    {
      label: 'Reelhouse',
      submenu: [
        { label: 'Open Reelhouse', click: () => void loadReelhouse() },
        { label: 'Server settings…', click: () => void loadSettings() },
        {
          label: 'Open Downloads folder',
          click: () => void openDownloadsDirectory(),
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
  ])
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 920,
    minHeight: 640,
    backgroundColor: '#18181b',
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    show: false,
    title: 'Reelhouse',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
      sandbox: true,
    },
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalHttp(url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isTrustedNavigation(url)) return
    event.preventDefault()
    openExternalHttp(url)
  })

  mainWindow.webContents.on(
    'did-fail-load',
    (_event, _code, description, validatedUrl, isMainFrame) => {
      if (!isMainFrame || !/^https?:/i.test(validatedUrl)) return
      void mainWindow?.loadFile(path.join(__dirname, 'offline.html'), {
        query: { description },
      })
    },
  )

  Menu.setApplicationMenu(createMenu())
  void loadReelhouse()
}

ipcMain.handle('reelhouse:get-config', () => ({
  appVersion: app.getVersion(),
  downloadsDirectory: downloadsDirectory(),
  serverUrl: readServerUrl(),
}))

ipcMain.handle('reelhouse:set-server-url', async (_event, value) => {
  try {
    const serverUrl = writeServerUrl(value)
    await mainWindow?.loadURL(serverUrl)
    return { ok: true, serverUrl }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Invalid server URL.',
    }
  }
})

ipcMain.handle('reelhouse:open-downloads', () => openDownloadsDirectory())
ipcMain.handle('reelhouse:retry', () => loadReelhouse())
ipcMain.handle('reelhouse:settings', () => loadSettings())

const hasLock = app.requestSingleInstanceLock()
if (!hasLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  app.whenReady().then(() => {
    app.setAppUserModelId('com.reelhouse.desktop')
    configureNativeDownloads()
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
