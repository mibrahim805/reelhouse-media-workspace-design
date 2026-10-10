const {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  Notification,
  protocol,
  session,
  shell,
} = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const { Readable } = require('node:stream')
const { spawn } = require('node:child_process')

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'reelhouse-media',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true },
  },
])

const DEFAULT_SERVER_URL =
  process.env.REELHOUSE_SERVER_URL ||
  'https://reelhouse.kubeletto.app'
const LEGACY_SERVER_URLS = new Set([
  'https://pajamas-hexagon-equation.ngrok-free.dev',
])

let mainWindow = null
const localDownloads = new Map()
const canceledDownloads = new Set()

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

function mediaContentType(filename) {
  const extension = path.extname(filename).toLowerCase()
  return {
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mkv': 'video/x-matroska',
    '.mp3': 'audio/mpeg',
    '.m4a': 'audio/mp4',
    '.aac': 'audio/aac',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.flac': 'audio/flac',
  }[extension] || 'application/octet-stream'
}

function parseMediaRange(value, size) {
  if (!value) return null
  const match = value.match(/^bytes=(\d*)-(\d*)$/)
  if (!match || (!match[1] && !match[2])) return false

  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]))
  const end = match[2] ? Number(match[2]) : size - 1
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= size) return false
  return { start, end: Math.min(end, size - 1) }
}

function configureLocalMediaProtocol() {
  protocol.handle('reelhouse-media', async request => {
    try {
      const url = new URL(request.url)
      if (url.hostname !== 'local') return new Response('Not found', { status: 404 })
      const filename = path.basename(decodeURIComponent(url.pathname.replace(/^\/+/, '')))
      const directory = path.resolve(downloadsDirectory())
      const target = path.resolve(directory, filename)
      if (!filename || !target.startsWith(`${directory}${path.sep}`) || !fs.existsSync(target)) return new Response('Media not found', { status: 404 })

      const size = fs.statSync(target).size
      const range = parseMediaRange(request.headers.get('range'), size)
      if (range === false) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } })
      const start = range?.start ?? 0
      const end = range?.end ?? size - 1
      const headers = {
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-store',
        'Content-Length': String(end - start + 1),
        'Content-Type': mediaContentType(filename),
      }
      if (range) headers['Content-Range'] = `bytes ${start}-${end}/${size}`
      return new Response(Readable.toWeb(fs.createReadStream(target, { start, end })), { status: range ? 206 : 200, headers })
    } catch (error) {
      return new Response(error instanceof Error ? error.message : 'Media request failed.', { status: 500 })
    }
  })
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

function resolveYtDlp() {
  const candidates = [
    process.env.REELHOUSE_YTDLP_PATH,
    path.join(app.getPath('home'), '.local', 'bin', 'yt-dlp'),
    '/usr/local/bin/yt-dlp',
    '/usr/bin/yt-dlp',
  ].filter(Boolean)
  const executable = candidates.find(candidate => fs.existsSync(candidate))
  return executable || 'yt-dlp'
}

function newestMediaFile(directory, startedAt) {
  const files = fs.readdirSync(directory, { withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => path.join(directory, entry.name))
    .filter(file => {
      try { return fs.statSync(file).mtimeMs >= startedAt } catch { return false }
    })
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs)
  return files[0] || ''
}

function formatDuration(seconds) {
  const value = Number(seconds)
  if (!Number.isFinite(value) || value <= 0) return 'Unknown duration'
  const total = Math.floor(value)
  const minutes = Math.floor(total / 60)
  const remaining = String(total % 60).padStart(2, '0')
  const hours = Math.floor(minutes / 60)
  return hours ? `${hours}:${String(minutes % 60).padStart(2, '0')}:${remaining}` : `${minutes}:${remaining}`
}

function fallbackQualityOptions() {
  return [1080, 720, 480, 360, 240, 144].map(height => ({
    value: String(height),
    label: `Up to ${height}p`,
    extension: 'mp4',
    filesize: null,
    filesize_label: 'Estimated size',
  })).concat({
    value: 'best',
    label: 'Best available',
    extension: 'mp4',
    filesize: null,
    filesize_label: 'Estimated size',
  }, {
    value: 'audio',
    label: 'Audio only',
    extension: 'mp3',
    filesize: null,
    filesize_label: 'Estimated size',
  })
}

function localQualityOptions(info, isYoutube) {
  if (!isYoutube) return []
  const byHeight = new Map()
  for (const format of info.formats || []) {
    const height = Number(format.height)
    if (!Number.isSafeInteger(height) || height <= 0 || format.vcodec === 'none') continue
    const filesize = Number(format.filesize || format.filesize_approx || 0) || null
    const current = byHeight.get(height)
    if (!current || (filesize || 0) > (current.filesize || 0)) {
      byHeight.set(height, {
        value: String(height),
        label: `${height}p`,
        extension: format.ext || 'mp4',
        filesize,
        filesize_label: filesize ? `${Math.round(filesize / 1024 / 1024 * 10) / 10} MB` : 'Unknown size',
      })
    }
  }
  const qualities = [...byHeight.values()].sort((left, right) => Number(right.value) - Number(left.value)).slice(0, 8)
  return qualities.length ? qualities.concat({ value: 'audio', label: 'Audio only', extension: 'mp3', filesize: null, filesize_label: 'Estimated size' }) : fallbackQualityOptions()
}

function localMediaInfoPayload(url, info) {
  const host = String(info.extractor_key || info.extractor || '').toLowerCase()
  const normalizedUrl = info.webpage_url || url
  const isYoutube = host.includes('youtube') || /(?:youtube\.com|youtu\.be)/i.test(normalizedUrl)
  const videoId = String(info.id || '')
  return {
    source_url: normalizedUrl,
    webpage_url: normalizedUrl,
    title: info.title || 'Untitled video',
    channel: info.uploader || info.channel || 'Unknown channel',
    duration: formatDuration(info.duration),
    thumbnail: info.thumbnail || '',
    platform: isYoutube ? 'YouTube' : info.extractor_key || 'Video',
    embed_url: isYoutube && videoId ? `https://www.youtube.com/embed/${videoId}` : '',
    can_embed: isYoutube,
    qualities: localQualityOptions(info, isYoutube),
  }
}

function fetchLocalMediaInfo(url) {
  return new Promise((resolve, reject) => {
    const child = spawn(resolveYtDlp(), [
      '--dump-single-json', '--no-playlist', '--skip-download', '--no-warnings', url,
    ], { env: { ...process.env, PATH: `${path.join(app.getPath('home'), '.local', 'bin')}:${process.env.PATH || ''}` } })
    let stdout = ''
    let stderr = ''
    const timeout = setTimeout(() => child.kill('SIGTERM'), 45_000)
    child.stdout.on('data', chunk => { stdout += String(chunk) })
    child.stderr.on('data', chunk => { stderr += String(chunk) })
    child.on('error', error => {
      clearTimeout(timeout)
      reject(new Error(error.code === 'ENOENT' ? 'yt-dlp is not installed. Install yt-dlp and ffmpeg, then retry.' : error.message))
    })
    child.on('close', code => {
      clearTimeout(timeout)
      if (code !== 0) {
        reject(new Error(stderr.trim() || 'Local media information lookup failed.'))
        return
      }
      try {
        const start = stdout.indexOf('{')
        const end = stdout.lastIndexOf('}')
        if (start < 0 || end <= start) throw new Error('yt-dlp returned no media information.')
        resolve(localMediaInfoPayload(url, JSON.parse(stdout.slice(start, end + 1))))
      } catch (error) {
        reject(error instanceof Error ? error : new Error('Could not read media information.'))
      }
    })
  })
}

function startLocalDownload({ id, url, quality }) {
  const directory = downloadsDirectory()
  fs.mkdirSync(directory, { recursive: true })
  const startedAt = Date.now()
  const height = Number.parseInt(String(quality || ''), 10)
  const audioOnly = String(quality || '').toLowerCase() === 'audio'
  const format = Number.isFinite(height)
    ? `bestvideo[height<=${height}]+bestaudio/best[height<=${height}]/best`
    : 'bestvideo+bestaudio/best'
  const output = path.join(directory, '%(title)s.%(ext)s')
  const args = [
    '--no-playlist', '--newline', '--restrict-filenames', '--progress',
    ...(audioOnly ? ['-x', '--audio-format', 'mp3', '--audio-quality', '0'] : ['--merge-output-format', 'mp4', '-f', format]),
    '--print', 'after_move:filepath', '-o', output, url,
  ]
  const child = spawn(resolveYtDlp(), args, { env: { ...process.env, PATH: `${path.join(app.getPath('home'), '.local', 'bin')}:${process.env.PATH || ''}` } })
  localDownloads.set(id, child)
  let lastPath = ''
  sendDownloadState({ state: 'started', id, progress: 0 })
  child.stdout.on('data', (chunk) => {
    const text = String(chunk)
    const progress = text.match(/(\d+(?:\.\d+)?)%/)
    const destination = text.match(/Destination:\s+(.+)$/m)
    if (destination) lastPath = destination[1].trim()
    text.split(/\r?\n/).map(line => line.trim()).filter(Boolean).forEach(line => {
      if (path.isAbsolute(line) && fs.existsSync(line)) lastPath = line
    })
    sendDownloadState({ state: 'progress', id, progress: progress ? Number(progress[1]) : 0 })
  })
  child.stderr.on('data', (chunk) => {
    const progress = String(chunk).match(/(\d+(?:\.\d+)?)%/)
    if (progress) sendDownloadState({ state: 'progress', id, progress: Number(progress[1]) })
  })
  child.on('error', (error) => {
    localDownloads.delete(id)
    sendDownloadState({ state: 'error', id, error: error.code === 'ENOENT' ? 'yt-dlp is not installed. Install yt-dlp and ffmpeg, then retry.' : error.message })
  })
  child.on('close', (code) => {
    const wasCanceled = canceledDownloads.delete(id)
    localDownloads.delete(id)
    if (wasCanceled) {
      sendDownloadState({ state: 'canceled', id })
      return
    }
    if (code === 0) {
      const finalPath = fs.existsSync(lastPath) ? lastPath : newestMediaFile(directory, startedAt)
      if (finalPath) sendDownloadState({ state: 'completed', id, path: finalPath, filename: path.basename(finalPath) })
      else sendDownloadState({ state: 'error', id, error: 'yt-dlp finished but no media file was found.' })
    } else {
      sendDownloadState({ state: 'error', id, error: 'Local download failed. Check the URL, yt-dlp, and ffmpeg.' })
    }
  })
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
        { label: 'Back', accelerator: 'Alt+Left', click: () => mainWindow?.webContents.goBack() },
        { label: 'Forward', accelerator: 'Alt+Right', click: () => mainWindow?.webContents.goForward() },
        { type: 'separator' },
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
ipcMain.handle('reelhouse:navigate-back', () => {
  if (mainWindow?.webContents.canGoBack()) mainWindow.webContents.goBack()
})
ipcMain.handle('reelhouse:navigate-forward', () => {
  if (mainWindow?.webContents.canGoForward()) mainWindow.webContents.goForward()
})
ipcMain.handle('reelhouse:local-download', (_event, input) => {
  startLocalDownload(input)
  return { ok: true }
})
ipcMain.handle('reelhouse:fetch-media-info', async (_event, url) => {
  try {
    return { ok: true, video: await fetchLocalMediaInfo(String(url || '').trim()) }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not load media information.' }
  }
})
ipcMain.handle('reelhouse:cancel-local-download', (_event, id) => {
  const child = localDownloads.get(id)
  if (!child) return { ok: false }
  canceledDownloads.add(id)
  child.kill('SIGTERM')
  return { ok: true }
})
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
    configureLocalMediaProtocol()
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
