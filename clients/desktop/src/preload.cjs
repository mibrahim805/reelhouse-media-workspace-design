const { contextBridge, ipcRenderer } = require('electron')

function installDesktopNavigation() {
  if (window.__reelhouseDesktopNavigation) return
  window.__reelhouseDesktopNavigation = true

  const style = document.createElement('style')
  style.textContent = `
    #reelhouse-desktop-back,
    #reelhouse-desktop-exit-fullscreen {
      align-items: center;
      backdrop-filter: blur(16px);
      background: rgba(21, 21, 21, .88);
      border: 1px solid rgba(255, 255, 255, .16);
      border-radius: 999px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, .28);
      color: #fff;
      cursor: pointer;
      display: inline-flex;
      font: 600 13px/1 system-ui, sans-serif;
      gap: 7px;
      min-height: 38px;
      padding: 0 14px;
      position: fixed;
      user-select: none;
      z-index: 2147483647;
    }
    #reelhouse-desktop-back {
      left: 16px;
      top: 16px;
    }
    #reelhouse-desktop-back:hover,
    #reelhouse-desktop-exit-fullscreen:hover {
      background: rgba(55, 55, 55, .94);
    }
    #reelhouse-desktop-back:active,
    #reelhouse-desktop-exit-fullscreen:active {
      transform: scale(.96);
    }
    #reelhouse-desktop-exit-fullscreen {
      left: 16px;
      top: 16px;
    }
    .reelhouse-desktop-fullscreen-surface {
      background: #000 !important;
      border-radius: 0 !important;
      height: 100vh !important;
      max-height: none !important;
      max-width: none !important;
      width: 100vw !important;
    }
  `
  document.documentElement.appendChild(style)

  const backButton = document.createElement('button')
  backButton.id = 'reelhouse-desktop-back'
  backButton.type = 'button'
  backButton.setAttribute('aria-label', 'Go back')
  backButton.textContent = '←  Back'
  backButton.addEventListener('click', () => {
    if (window.history.length > 1) window.history.back()
    else window.location.assign('/')
  })
  document.body.appendChild(backButton)

  const updateBackButton = () => {
    const path = window.location.pathname
    const isEntry = path === '/' || path.startsWith('/splash') || path.startsWith('/onboarding') || path.startsWith('/permissions')
    backButton.hidden = isEntry
  }
  const originalPushState = window.history.pushState
  const originalReplaceState = window.history.replaceState
  window.history.pushState = function (...args) {
    const result = originalPushState.apply(this, args)
    updateBackButton()
    return result
  }
  window.history.replaceState = function (...args) {
    const result = originalReplaceState.apply(this, args)
    updateBackButton()
    return result
  }
  window.addEventListener('popstate', updateBackButton)
  updateBackButton()

  const originalRequestFullscreen = Element.prototype.requestFullscreen
  if (originalRequestFullscreen) {
    Element.prototype.requestFullscreen = function (options) {
      const target = this instanceof HTMLVideoElement ? this.parentElement || this : this
      return originalRequestFullscreen.call(target, options)
    }
  }

  const updateFullscreenButton = () => {
    const current = document.fullscreenElement
    document.getElementById('reelhouse-desktop-exit-fullscreen')?.remove()
    document.querySelectorAll('.reelhouse-desktop-fullscreen-surface').forEach(element => element.classList.remove('reelhouse-desktop-fullscreen-surface'))
    if (!current) return

    current.classList.add('reelhouse-desktop-fullscreen-surface')
    const exitButton = document.createElement('button')
    exitButton.id = 'reelhouse-desktop-exit-fullscreen'
    exitButton.type = 'button'
    exitButton.setAttribute('aria-label', 'Exit fullscreen')
    exitButton.textContent = '×  Exit fullscreen'
    exitButton.addEventListener('click', event => {
      event.preventDefault()
      event.stopPropagation()
      void document.exitFullscreen()
    })
    current.appendChild(exitButton)
  }
  document.addEventListener('fullscreenchange', updateFullscreenButton)
}

function installDesktopMetadataFallback() {
  if (window.__reelhouseDesktopMetadataFallback) return
  window.__reelhouseDesktopMetadataFallback = true
  const nativeFetch = window.fetch.bind(window)
  window.fetch = async (input, init) => {
    const requestUrl = typeof input === 'string' ? input : input?.url || ''
    const method = String(init?.method || (typeof Request !== 'undefined' && input instanceof Request ? input.method : 'GET')).toUpperCase()
    if (method !== 'POST') return nativeFetch(input, init)
    let pathname = ''
    try { pathname = new URL(requestUrl, window.location.href).pathname } catch { return nativeFetch(input, init) }
    if (!pathname.endsWith('/api/backend/fetch-info')) return nativeFetch(input, init)

    try {
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {}
      const result = await ipcRenderer.invoke('reelhouse:fetch-media-info', body.url)
      return new Response(JSON.stringify(result), {
        status: result.ok ? 200 : 400,
        headers: { 'Content-Type': 'application/json' },
      })
    } catch {
      return nativeFetch(input, init)
    }
  }
}

function installKnownVideoCompatibility() {
  if (window.__reelhouseKnownVideoCompatibility) return
  window.__reelhouseKnownVideoCompatibility = true
  const replacements = new Map([
    ['Kbj2Zmg1776', 'Kbj2Zss-5GY'],
    ['ic8j13U_FS8', 'e-ORhEE9VVg'],
  ])
  const rewrite = () => {
    document.querySelectorAll('a[href], iframe[src]').forEach(element => {
      const attribute = element.tagName === 'IFRAME' ? 'src' : 'href'
      const value = element.getAttribute(attribute) || ''
      for (const [oldId, newId] of replacements) {
        if (value.includes(oldId)) element.setAttribute(attribute, value.replaceAll(oldId, newId))
      }
    })
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', rewrite, { once: true })
  else rewrite()
  new MutationObserver(rewrite).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['href', 'src'] })
}

installDesktopMetadataFallback()
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    installDesktopNavigation()
    installKnownVideoCompatibility()
  }, { once: true })
} else {
  installDesktopNavigation()
  installKnownVideoCompatibility()
}

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
  fetchMediaInfo: (url) => ipcRenderer.invoke('reelhouse:fetch-media-info', url),
  localDownload: (input) => ipcRenderer.invoke('reelhouse:local-download', input),
  cancelLocalDownload: (id) => ipcRenderer.invoke('reelhouse:cancel-local-download', id),
  setServerUrl: (value) =>
    ipcRenderer.invoke('reelhouse:set-server-url', value),
})
