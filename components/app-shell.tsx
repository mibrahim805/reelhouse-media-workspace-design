'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Download, Home, Library, Play, UserRound, Tv } from 'lucide-react'
import { useDownloads } from '@/components/download-store'
import { DownloadsPanel } from '@/components/downloads-panel'
import { cn } from '@/lib/utils'
import { APP_BRAND } from '@/lib/app-brand'

const NAV = [
  { href: '/',          label: 'Home',      icon: Home },
  { href: '/downloads', label: 'Downloads', icon: Download },
  { href: '/library',   label: 'Library',   icon: Library },
  { href: '/profile',   label: 'Profile',   icon: UserRound },
]

// Screens that should render without any shell chrome
const ENTRY_PREFIXES = ['/splash', '/onboarding/', '/permissions']

function DownloadBadge() {
  const { activeCount, panelOpen, setPanelOpen } = useDownloads()
  return (
    <div className="relative">
      <button
        onClick={() => setPanelOpen(!panelOpen)}
        aria-label={`Downloads${activeCount ? `, ${activeCount} active` : ''}`}
        className="flex size-9 items-center justify-center rounded-xl border border-[#292929] bg-[#151515] text-[#a3a3a3] hover:text-white"
      >
        <Download className="size-4" />
        {activeCount > 0 && (
          <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-white">
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
  const { activeCount } = useDownloads()

  const isEntry = ENTRY_PREFIXES.some(p => pathname === p || pathname.startsWith(p))
  if (isEntry) return <>{children}</>

  // Full-screen immersive screens — no desktop top bar but keep bottom nav
  const isPlayer = pathname.startsWith('/player/') || pathname.startsWith('/music/')

  return (
    <div className="flex min-h-svh flex-col bg-[#090909]">

      {/* ── Desktop top nav (≥ md) ── */}
      {!isPlayer && (
        <header className="sticky top-0 z-50 hidden border-b border-[#292929] bg-[#090909]/90 backdrop-blur-md md:block">
          <div className="mx-auto flex h-14 w-full max-w-[1400px] items-center gap-4 px-5">
            {/* Logo */}
            <Link href="/" className="flex shrink-0 items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-lg bg-primary">
                <Play className="size-4 fill-white text-white" />
              </span>
              <span className="text-[15px] font-bold tracking-tight text-white">{APP_BRAND.name}</span>
            </Link>

            {/* Nav links */}
            <nav className="flex items-center gap-1" aria-label="Primary">
              {NAV.map(item => {
                const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
                const Icon = item.icon
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-medium transition-colors',
                      active ? 'bg-primary/15 text-primary' : 'text-[#a3a3a3] hover:bg-[#1d1d1d] hover:text-white',
                    )}
                  >
                    <Icon className="size-4" />
                    {item.label}
                  </Link>
                )
              })}
              <Link href="/youtube" className={cn('flex items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-medium', pathname.startsWith('/youtube') ? 'bg-primary/15 text-primary' : 'text-[#a3a3a3] hover:bg-[#1d1d1d] hover:text-white')}>
                <Tv className="size-4" /> YouTube
              </Link>
            </nav>

            {/* Right actions */}
            <div className="ml-auto flex items-center gap-2">
              <DownloadBadge />
              <Link
                href="/profile"
                className="flex size-9 items-center justify-center rounded-full bg-[#1d1d1d] text-xs font-bold text-white hover:bg-primary/20"
                aria-label="Profile"
              >
                R
              </Link>
            </div>
          </div>
        </header>
      )}

      {/* ── Page content ── */}
      <main className="flex-1">{children}</main>

      {/* ── Mobile bottom nav (< md) ── */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-[#292929] bg-[#090909]/95 px-1 pb-[max(.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl md:hidden"
        aria-label="Primary navigation"
      >
        {NAV.map(item => {
          const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'relative flex flex-col items-center gap-1 text-[10px] font-medium transition-colors',
                active ? 'text-primary' : 'text-[#a3a3a3] hover:text-white',
              )}
            >
              <Icon className="size-5" />
              {item.label}
              {item.label === 'Downloads' && activeCount > 0 && (
                <span className="absolute -top-1 left-1/2 ml-2 flex size-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-white">
                  {activeCount}
                </span>
              )}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
