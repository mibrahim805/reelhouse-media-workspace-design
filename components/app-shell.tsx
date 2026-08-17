'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  ArrowLeft,
  ArrowRight,
  Download,
  Facebook,
  Instagram,
  MonitorPlay,
  Music2,
  Play,
} from 'lucide-react'
import { useDownloads } from '@/components/download-store'
import { DownloadsPanel } from '@/components/downloads-panel'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/', label: 'Home', icon: Play },
  { href: '/youtube', label: 'YouTube', icon: MonitorPlay },
  { href: '/downloader', label: 'Instagram', icon: Instagram },
  { href: '/downloader', label: 'TikTok', icon: Music2 },
  { href: '/downloader', label: 'Facebook', icon: Facebook },
]

function DownloadButton() {
  const { downloads, activeCount, panelOpen, setPanelOpen } = useDownloads()

  const active = downloads.filter((d) => d.status === 'downloading')
  const avg =
    active.length > 0
      ? active.reduce((sum, d) => sum + d.progress, 0) / active.length
      : 0

  const radius = 15
  const circumference = 2 * Math.PI * radius
  const dash = (avg / 100) * circumference

  return (
    <div className="relative">
      <button
        onClick={() => setPanelOpen(!panelOpen)}
        aria-label={`Downloads${activeCount ? `, ${activeCount} active` : ''}`}
        aria-expanded={panelOpen}
        className={cn(
          'relative flex size-9 items-center justify-center rounded-lg border border-border transition-colors',
          panelOpen ? 'bg-muted text-foreground' : 'text-foreground hover:bg-muted',
        )}
      >
        {active.length > 0 && (
          <svg
            className="absolute inset-0 -rotate-90"
            viewBox="0 0 36 36"
            aria-hidden
          >
            <circle
              cx="18"
              cy="18"
              r={radius}
              fill="none"
              className="stroke-primary/20"
              strokeWidth="2.5"
            />
            <circle
              cx="18"
              cy="18"
              r={radius}
              fill="none"
              className="stroke-primary transition-[stroke-dasharray] duration-300"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray={`${dash} ${circumference}`}
            />
          </svg>
        )}
        <Download className="size-4" />
        {activeCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold tabular-nums text-primary-foreground">
            {activeCount}
          </span>
        )}
      </button>
      <DownloadsPanel />
    </div>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  function goBack() {
    window.history.back()
  }

  function goForward() {
    window.history.forward()
  }

  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-[1600px] items-center gap-3 px-3 sm:px-5">
          <Link href="/" className="flex shrink-0 items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Play className="size-4 fill-current" />
            </span>
            <span className="hidden text-[15px] font-semibold tracking-tight text-foreground sm:block">
              Reelhouse
            </span>
          </Link>

          <nav
            aria-label="Media apps"
            className="flex min-w-0 items-center gap-1 overflow-x-auto rounded-lg border border-border bg-card/50 p-1"
          >
            {NAV.map((item) => {
              const active =
                item.href === '/'
                  ? pathname === '/'
                  : pathname.startsWith(item.href)
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors',
                    active
                      ? 'bg-primary/15 text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  <Icon className="size-4" />
                  <span className="hidden lg:block">{item.label}</span>
                </Link>
              )
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <div className="flex items-center rounded-lg border border-border bg-card/50 p-1">
              <button
                type="button"
                onClick={goBack}
                aria-label="Go back"
                title="Back (Alt+Left)"
                className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ArrowLeft className="size-4" />
              </button>
              <button
                type="button"
                onClick={goForward}
                aria-label="Go forward"
                title="Forward (Alt+Right)"
                className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ArrowRight className="size-4" />
              </button>
            </div>
            <DownloadButton />
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>
    </div>
  )
}
