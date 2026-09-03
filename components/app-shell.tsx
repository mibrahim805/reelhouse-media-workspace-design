'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
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
        className="flex size-9 items-center justify-center rounded-xl border border-[#292929] bg-[#151515] text-[#a3a3a3] transition-all duration-300 hover:text-white hover:bg-[#1d1d1d] hover:scale-105 active:scale-95"
      >
        <Download className="size-4" />
        {activeCount > 0 && (
          <span className="badge-pop absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-white">
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
  const [navigationPending, setNavigationPending] = useState(false)

  useEffect(() => {
    setNavigationPending(false)
  }, [pathname])

  function handleShellClick(event: React.MouseEvent<HTMLDivElement>) {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    if (!(event.target instanceof Element)) return
    const anchor = event.target.closest('a[href]')
    const href = anchor?.getAttribute('href')
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return
    const destination = new URL(href, window.location.href)
    if (destination.origin !== window.location.origin) return
    if (destination.pathname === window.location.pathname && destination.search === window.location.search) return

    // Android WebView has a noticeably slower RSC round-trip than a desktop
    // browser. Use the cached app document for internal links there so a tap
    // is not held up waiting for the hosted Next.js navigation request.
    // The service worker serves the shell route from cache and revalidates it
    // in the background. Keep modifier-key and external-link behavior above.
    if (/Android/i.test(navigator.userAgent)) {
      event.preventDefault()
      event.stopPropagation()
      setNavigationPending(true)
      window.location.assign(destination.href)
      return
    }

    setNavigationPending(true)
  }

  const isEntry = ENTRY_PREFIXES.some(p => pathname === p || pathname.startsWith(p))
  if (isEntry) return <>{children}</>

  // Full-screen immersive screens — no desktop top bar but keep bottom nav
  const isPlayer = pathname.startsWith('/player/') || pathname.startsWith('/music/')

  const activeNavIndex = NAV.findIndex(item =>
    item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
  )

  return (
    <div className="flex min-h-svh flex-col bg-[#0b0813] text-white relative overflow-x-hidden" onClickCapture={handleShellClick}>
      {navigationPending && <div className="navigation-progress" role="status" aria-label="Loading page" />}

      {/* ── Global Background Floating 3D Water Bubbles & Ambient Blobs ── */}
      <div className="home-glow animate-liquid-blob-1 fixed -top-32 -right-32 size-[500px] rounded-full bg-gradient-to-br from-fuchsia-600/25 via-purple-600/15 to-pink-500/15 blur-[120px] pointer-events-none z-0" />
      <div className="home-glow animate-liquid-blob-2 fixed top-1/2 -left-32 size-[450px] rounded-full bg-gradient-to-tr from-purple-600/20 via-blue-600/15 to-fuchsia-500/15 blur-[130px] pointer-events-none z-0" />

      <div className="water-bubble fixed top-16 -right-10 size-40 opacity-70 z-0" style={{ animationDelay: '0s' }} />
      <div className="water-bubble fixed top-1/3 -left-14 size-52 opacity-60 z-0" style={{ animationDelay: '-4s' }} />
      <div className="water-bubble fixed top-2/3 right-6 size-32 opacity-65 z-0" style={{ animationDelay: '-8s' }} />
      <div className="water-bubble fixed bottom-20 left-12 size-44 opacity-55 z-0" style={{ animationDelay: '-12s' }} />

      {/* ── Desktop top nav (≥ md) ── */}
      {!isPlayer && (
        <header className="sticky top-0 z-50 hidden liquid-glass-pill border-b-0 my-3 mx-auto w-[95%] max-w-[1400px] rounded-2xl md:block transition-all duration-300">
          <div className="mx-auto flex h-14 w-full items-center gap-4 px-5">
            {/* Logo */}
            <Link href="/" className="flex shrink-0 items-center gap-2 group">
              <span className="flex size-8 items-center justify-center rounded-lg liquid-glow-btn text-white transition-all duration-300 group-hover:scale-105">
                <Play className="size-4 fill-white text-white" />
              </span>
              <span className="text-[15px] font-bold tracking-tight text-white drop-shadow">{APP_BRAND.name}</span>
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
                      'relative flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-medium transition-all duration-300 active:scale-95',
                      active ? 'liquid-glow-btn text-white font-bold' : 'text-white/70 hover:bg-white/10 hover:text-white',
                    )}
                  >
                    <Icon className={cn('size-4 transition-transform duration-300', active && 'scale-110')} />
                    {item.label}
                  </Link>
                )
              })}
              <Link href="/youtube" className={cn(
                'relative flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-medium transition-all duration-300',
                pathname.startsWith('/youtube') ? 'liquid-glow-btn text-white font-bold' : 'text-white/70 hover:bg-white/10 hover:text-white',
              )}>
                <Tv className="size-4" /> YouTube
              </Link>
            </nav>

            {/* Right actions */}
            <div className="ml-auto flex items-center gap-2">
              <DownloadBadge />
              <Link
                href="/profile"
                className="flex size-9 items-center justify-center rounded-full liquid-glass-input text-xs font-bold text-white transition-all duration-300 hover:border-[#d946ef] hover:scale-105 active:scale-95 shadow-md"
                aria-label="Profile"
              >
                R
              </Link>
            </div>
          </div>
        </header>
      )}

      {/* ── Page content ── */}
      <main key={pathname} className="page-transition flex-1 pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0">{children}</main>

      {/* ── Mobile bottom nav (< md) ── */}
      <nav
        className="liquid-glass-pill fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3.5 rounded-full p-2.5 md:hidden"
        aria-label="Primary navigation"
      >
        {/* Sliding 3D Liquid Water Bubble Droplet Indicator */}
        {activeNavIndex !== -1 && (
          <div
            className="sliding-liquid-bubble"
            style={{
              transform: `translate3d(${activeNavIndex * 58}px, 0, 0)`,
            }}
          />
        )}

        {NAV.map((item, index) => {
          const active = index === activeNavIndex
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'relative z-10 flex size-11 items-center justify-center rounded-full transition-all duration-300 active:scale-90',
                active ? 'text-white drop-shadow-md font-bold' : 'text-white/70 hover:text-white',
              )}
            >
              <Icon className={cn('size-5 transition-transform duration-300', active && 'scale-110')} />
              {item.label === 'Downloads' && activeCount > 0 && (
                <span className="absolute -top-1 -right-1 z-20 flex size-4 items-center justify-center rounded-full bg-[#d946ef] text-[9px] font-bold text-white ring-2 ring-[#0b0813] shadow-[0_0_8px_rgba(217,70,239,0.8)]">
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
