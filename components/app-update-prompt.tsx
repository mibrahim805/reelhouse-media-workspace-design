'use client'

import { useEffect, useState } from 'react'
import { Download, Loader2 } from 'lucide-react'

type UpdateResponse = {
  ok: boolean
  versionCode: number
  versionName: string
}

type AvailableUpdate = Pick<UpdateResponse, 'versionCode' | 'versionName'> & {
  downloadUrl: string
}

type DownloadStatus = 'idle' | 'downloading' | 'installing' | 'failed'

function versionParts(version: string) {
  return version
    .replace(/^v/i, '')
    .split('.')
    .map(part => Number.parseInt(part, 10))
    .map(part => (Number.isFinite(part) ? part : 0))
}

function isNewerVersion(available: string, installed: string) {
  const availableParts = versionParts(available)
  const installedParts = versionParts(installed)
  const length = Math.max(availableParts.length, installedParts.length)
  for (let index = 0; index < length; index += 1) {
    const difference = (availableParts[index] || 0) - (installedParts[index] || 0)
    if (difference !== 0) return difference > 0
  }
  return false
}

export function AppUpdatePrompt() {
  const [update, setUpdate] = useState<AvailableUpdate | null>(null)
  const [status, setStatus] = useState<DownloadStatus>('idle')

  useEffect(() => {
    // The Android shell adds this marker to its WebView user agent. Keeping
    // this check here prevents ordinary website visitors from seeing an APK
    // update prompt.
    const appMatch = navigator.userAgent.match(
      /ReelhouseAndroid\/([^\s;]+)(?:;\s*code=(\d+))?/i,
    )
    if (!appMatch) return

    const installedVersionName = appMatch[1]
    const installedVersionCode = Number.parseInt(appMatch[2] || '', 10)
    const controller = new AbortController()

    fetch('/api/app-update/android', {
      cache: 'no-store',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
      .then(response => {
        if (!response.ok) throw new Error('Update check failed')
        return response.json() as Promise<UpdateResponse>
      })
      .then(payload => {
        if (
          !payload.ok
          || !Number.isInteger(payload.versionCode)
          || payload.versionCode <= 0
          || typeof payload.versionName !== 'string'
          || !payload.versionName.trim()
        ) return

        const codeIsNewer = Number.isInteger(installedVersionCode)
          && payload.versionCode > installedVersionCode
        const nameIsNewer = isNewerVersion(payload.versionName, installedVersionName)
        if (codeIsNewer || nameIsNewer) {
          setUpdate({
            versionCode: payload.versionCode,
            versionName: payload.versionName.trim(),
            downloadUrl: '/api/app-download/android',
          })
        }
      })
      .catch(() => {
        // An update check must never block or disturb the application when
        // the device is offline or the endpoint is temporarily unavailable.
      })

    return () => controller.abort()
  }, [])

  useEffect(() => {
    function handleUpdateEvent(e: Event) {
      const customEvent = e as CustomEvent<{ status?: DownloadStatus }>
      if (customEvent.detail?.status) {
        setStatus(customEvent.detail.status)
      }
    }
    window.addEventListener('reelhouse-update-download', handleUpdateEvent)
    return () => window.removeEventListener('reelhouse-update-download', handleUpdateEvent)
  }, [])

  if (!update) return null

  const handleStartUpdate = () => {
    setStatus('downloading')
    window.location.href = update.downloadUrl
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="app-update-title">
      <section className="modal-content w-full max-w-md rounded-3xl border border-[#292929] bg-[#151515] p-6 shadow-2xl" style={{ animation: 'fade-up 0.4s var(--ease-spring) both' }}>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">New version available</p>
        <h2 id="app-update-title" className="mt-2 text-2xl font-bold text-white">Update {update.versionName}</h2>
        <p className="mt-3 text-sm leading-6 text-[#a3a3a3]">
          {status === 'downloading' && 'Downloading update file... Check notifications for progress.'}
          {status === 'installing' && 'Opening package installer... Follow on-screen instructions to finish.'}
          {status === 'failed' && 'Download failed or installer could not open. Please try again.'}
          {status === 'idle' && 'A newer version of the app is ready. Update now to get the latest improvements and fixes.'}
        </p>

        {status === 'downloading' && (
          <div className="mt-4 flex items-center gap-2 text-xs font-medium text-primary">
            <Loader2 className="size-4 animate-spin" />
            <span>Downloading update package...</span>
          </div>
        )}

        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setUpdate(null)}
            disabled={status === 'downloading'}
            className="secondary-button min-h-11 disabled:opacity-50"
          >
            {status === 'downloading' ? 'Dismiss' : 'Later'}
          </button>
          <button
            type="button"
            onClick={handleStartUpdate}
            disabled={status === 'downloading' || status === 'installing'}
            className="primary-button min-h-11 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {status === 'downloading' ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Downloading...
              </>
            ) : status === 'installing' ? (
              <>Installing...</>
            ) : (
              <>
                <Download className="size-4" />
                {status === 'failed' ? 'Retry Update' : 'Update Now'}
              </>
            )}
          </button>
        </div>
      </section>
    </div>
  )
}
