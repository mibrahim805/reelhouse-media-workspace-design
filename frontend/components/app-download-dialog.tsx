'use client'

import { useEffect, useId, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import {
  CheckCircle2,
  Download,
  Laptop,
  LoaderCircle,
  Monitor,
  Smartphone,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type PlatformId = 'windows' | 'linux' | 'android'

type DownloadAsset = {
  filename: string
  format: string
  label: string
  size: number | null
  url: string
}

type DownloadManifest = {
  platforms: Record<
    PlatformId,
    { available: boolean; assets: DownloadAsset[] }
  >
}

const PLATFORM_DETAILS = {
  windows: {
    label: 'Windows',
    note: 'Windows 10 or newer',
    Icon: Monitor,
  },
  linux: {
    label: 'Linux',
    note: 'Ubuntu, Debian, and AppImage',
    Icon: Laptop,
  },
  android: {
    label: 'Android',
    note: 'Android 7 or newer',
    Icon: Smartphone,
  },
} as const

function formatBytes(value: number | null) {
  if (!value) return ''
  return value >= 1024 * 1024 * 1024
    ? `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`
    : `${Math.round(value / 1024 / 1024)} MB`
}

function installInstruction(platform: PlatformId, format: string) {
  if (platform === 'windows' && format === 'zip') {
    return 'When the ZIP finishes, select Extract all, open the extracted folder, and double-click Reelhouse.exe.'
  }
  if (platform === 'windows') {
    return 'When the download finishes, open the installer and approve the Windows installation prompts.'
  }
  if (platform === 'android') {
    return 'Open the APK from Downloads, allow installation from this source if asked, then tap Install.'
  }
  if (format === 'deb') {
    return 'Open the .deb file with Software Install, then select Install.'
  }
  return 'Open Properties for the AppImage, allow it to run as a program, then double-click it.'
}

function detectedPlatform(): PlatformId | null {
  const userAgent = navigator.userAgent.toLowerCase()
  if (userAgent.includes('android')) return 'android'
  if (userAgent.includes('windows')) return 'windows'
  if (userAgent.includes('linux') || userAgent.includes('x11')) return 'linux'
  return null
}

function isInstalledApp() {
  return (
    'reelhouseDesktop' in window ||
    navigator.userAgent.toLowerCase().includes('reelhouseandroid/')
  )
}

function subscribeToBrowserState() {
  return () => undefined
}

function getBrowserSnapshot() {
  return true
}

function getServerSnapshot() {
  return false
}

export function AppDownloadButton() {
  const titleId = useId()
  const [open, setOpen] = useState(false)
  const [manifest, setManifest] = useState<DownloadManifest | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [started, setStarted] = useState<{
    platform: PlatformId
    asset: DownloadAsset
  } | null>(null)
  const browserReady = useSyncExternalStore(
    subscribeToBrowserState,
    getBrowserSnapshot,
    getServerSnapshot,
  )
  const detected = browserReady ? detectedPlatform() : null
  const showDownloadButton = browserReady && !isInstalledApp()

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()

    async function loadPackages() {
      setLoading(true)
      setError('')
      try {
        const response = await fetch('/api/app-download', {
          cache: 'no-store',
          signal: controller.signal,
        })
        if (!response.ok) throw new Error('Package list unavailable.')
        setManifest((await response.json()) as DownloadManifest)
      } catch (loadError) {
        if (loadError instanceof DOMException && loadError.name === 'AbortError') {
          return
        }
        setError('Could not read the available app packages. Try again.')
      } finally {
        setLoading(false)
      }
    }

    void loadPackages()
    return () => controller.abort()
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  function startDownload(platform: PlatformId, asset: DownloadAsset) {
    setStarted({ platform, asset })
    const link = document.createElement('a')
    link.href = asset.url
    link.style.display = 'none'
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  if (!showDownloadButton) return null

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setStarted(null)
          setOpen(true)
        }}
        className="flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 sm:px-3"
      >
        <Laptop className="size-4" />
        <span className="hidden lg:inline">Download app</span>
      </button>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[80] flex items-end justify-center overflow-hidden p-0 sm:items-center sm:p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
          >
            <button
              type="button"
              aria-label="Close app download dialog"
              className="absolute inset-0 cursor-default bg-background/80 backdrop-blur-sm"
              onClick={() => setOpen(false)}
            />
            <div className="animate-in slide-in-from-bottom-4 fade-in relative z-10 flex max-h-[calc(100dvh-0.5rem)] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl border border-border bg-popover shadow-2xl duration-200 sm:max-h-[calc(100dvh-2rem)] sm:rounded-2xl">
            <div className="flex shrink-0 items-start gap-3 border-b border-border p-5">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                <Download className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 id={titleId} className="text-lg font-semibold text-foreground">
                  Download Reelhouse
                </h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Choose the device where you want to install the app.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4 sm:p-5">
              {loading && (
                <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
                  <LoaderCircle className="size-4 animate-spin" /> Checking packages…
                </div>
              )}

              {error && (
                <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                  {error}
                </div>
              )}

              {manifest &&
                (Object.keys(PLATFORM_DETAILS) as PlatformId[]).map(
                  (platform) => {
                    const details = PLATFORM_DETAILS[platform]
                    const platformPackages = manifest.platforms[platform]
                    const Icon = details.Icon
                    return (
                      <div
                        key={platform}
                        className={cn(
                          'rounded-xl border bg-background/40 p-3',
                          detected === platform
                            ? 'border-primary/60 ring-1 ring-primary/20'
                            : 'border-border',
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
                            <Icon className="size-5" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <h3 className="text-sm font-semibold text-foreground">
                                {details.label}
                              </h3>
                              {detected === platform && (
                                <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                                  Your device
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {details.note}
                            </p>
                          </div>
                        </div>

                        {platformPackages.available ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {platformPackages.assets.map((asset) => (
                              <button
                                key={asset.format}
                                type="button"
                                onClick={() => startDownload(platform, asset)}
                                className="flex min-h-9 flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                              >
                                <Download className="size-3.5" />
                                {asset.label}
                                {formatBytes(asset.size) && (
                                  <span className="font-normal opacity-75">
                                    · {formatBytes(asset.size)}
                                  </span>
                                )}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-3 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                            This package is not available on the server yet.
                          </p>
                        )}
                      </div>
                    )
                  },
                )}

              {started && (
                <div className="flex gap-3 rounded-xl border border-success/40 bg-success/10 p-3 text-sm">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
                  <div>
                    <p className="font-medium text-foreground">Download started</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                      {installInstruction(started.platform, started.asset.format)}
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="shrink-0 border-t border-border px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 text-center text-[11px] text-muted-foreground">
              Your device will ask for approval before installing the app.
            </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
