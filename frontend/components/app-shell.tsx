'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ArrowLeft, ArrowRight, Download, Link2, MonitorPlay, Play, UserRound } from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/', label: 'Home', icon: Play },
  { href: '/youtube', label: 'YouTube', icon: MonitorPlay },
  { href: '/downloader', label: 'Link Downloader', icon: Link2 },
]

function DownloadButton() {
  return (
    <Link href="/files" aria-label="My downloaded videos" className="flex size-9 items-center justify-center rounded-lg border border-border text-foreground transition-colors hover:bg-muted">
      <Download className="size-4" />
    </Link>
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
      <header className="sticky top-0 z-50 hidden border-b border-border bg-background/80 backdrop-blur-md sm:block">
        <div className="mx-auto flex h-14 w-full max-w-[1600px] items-center gap-3 px-3 sm:px-5">
          <Link href="/" className="flex shrink-0 items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Play className="size-4 fill-current" />
            </span>
            <span className="hidden text-[15px] font-semibold tracking-tight text-foreground sm:block">
              Reelhouse
            </span>
          </Link>

          <nav className="flex items-center gap-1 rounded-lg border border-border bg-card/50 p-1">
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
                    'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors',
                    active
                      ? 'bg-primary/15 text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  <Icon className="size-4" />
                  <span className="hidden md:block">{item.label}</span>
                </Link>
              )
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <div className="flex items-center rounded-lg border border-border bg-card/50 p-1">
              <button type="button" onClick={goBack} aria-label="Go back" title="Back (Alt+Left)" className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                <ArrowLeft className="size-4" />
              </button>
              <button type="button" onClick={goForward} aria-label="Go forward" title="Forward (Alt+Right)" className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                <ArrowRight className="size-4" />
              </button>
            </div>
            <Link
              href="/account"
              aria-label="Account"
              className="flex size-9 items-center justify-center rounded-lg border border-border text-foreground transition-colors hover:bg-muted"
            >
              <UserRound className="size-4" />
            </Link>
            {pathname !== '/' && (
              <DownloadButton />
            )}
          </div>
        </div>
      </header>

      <nav className="fixed inset-x-4 bottom-3 z-50 flex items-center justify-around rounded-full bg-white px-3 py-3 text-slate-700 shadow-lg ring-1 ring-black/5 sm:hidden">
        <Link href="/" className={cn('flex flex-col items-center gap-1 text-[10px]', pathname === '/' ? 'text-red-500' : 'text-slate-600')}><Play className="size-5" fill="currentColor" />HOME</Link>
        <Link href="/youtube" className="flex flex-col items-center gap-1 text-[10px] text-slate-600"><MonitorPlay className="size-5" />SHORTS</Link>
        <Link href="/files" className={cn('flex flex-col items-center gap-1 text-[10px]', pathname === '/files' ? 'text-red-500' : 'text-slate-600')}><Download className="size-5" />MY FILES</Link>
        <Link href="/account" className="flex flex-col items-center gap-1 text-[10px] text-slate-600"><UserRound className="size-5" />ME</Link>
      </nav>

      <main className="flex-1">{children}</main>
    </div>
  )
}
