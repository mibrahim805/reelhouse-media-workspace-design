'use client'

import { useEffect, useState } from 'react'

type UpdateResponse = {
  ok: boolean
  versionCode: number
  versionName: string
}

type AvailableUpdate = Pick<UpdateResponse, 'versionCode' | 'versionName'> & {
  downloadUrl: string
}

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

  if (!update) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="app-update-title">
      <section className="w-full max-w-md rounded-3xl border border-[#292929] bg-[#151515] p-6 shadow-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">New version available</p>
        <h2 id="app-update-title" className="mt-2 text-2xl font-bold text-white">Update {update.versionName}</h2>
        <p className="mt-3 text-sm leading-6 text-[#a3a3a3]">
          A newer version of my yt is ready. Update now to get the latest improvements.
        </p>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setUpdate(null)}
            className="secondary-button min-h-11"
          >
            Cancel
          </button>
          <a
            href={update.downloadUrl}
            className="primary-button min-h-11"
            onClick={() => setUpdate(null)}
          >
            Update
          </a>
        </div>
      </section>
    </div>
  )
}
