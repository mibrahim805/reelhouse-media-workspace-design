'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Download, Home, Library, Link2, Play, UserRound, Tv, Zap } from 'lucide-react'
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

const MOBILE_NAV = [
  { href: '/',          label: 'Home',      icon: Home },
  { href: '/shorts',    label: 'Shorts',    icon: Zap },
  { href: '/downloader', label: 'Paste Link', icon: Link2 },
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
  const [isSliding, setIsSliding] = useState(false)
  const [bubbleLeft, setBubbleLeft] = useState<number | null>(null)
  const mobileNavRef = useRef<HTMLElement>(null)
  const mobileNavItemRefs = useRef<Array<HTMLAnchorElement | null>>([])
  const activeMobileNavIndex = MOBILE_NAV.findIndex(item =>
    item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
  )

  useEffect(() => {
    setNavigationPending(false)
    setIsSliding(true)
    const timer = window.setTimeout(() => setIsSliding(false), 420)
    return () => window.clearTimeout(timer)
  }, [pathname])

  useLayoutEffect(() => {
    if (activeMobileNavIndex === -1) return

    const updateBubblePosition = () => {
      const nav = mobileNavRef.current
      const item = mobileNavItemRefs.current[activeMobileNavIndex]
      if (!nav || !item) return

      const navRect = nav.getBoundingClientRect()
      const itemRect = item.getBoundingClientRect()
      setBubbleLeft(itemRect.left - navRect.left + (itemRect.width - 44) / 2)
    }

    updateBubblePosition()
    window.addEventListener('resize', updateBubblePosition)
    return () => window.removeEventListener('resize', updateBubblePosition)
  }, [activeMobileNavIndex])

  function handleShellClick(event: React.MouseEvent<HTMLDivElement>) {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    if (!(event.target instanceof Element)) return
    const anchor = event.target.closest('a[href]')
    const href = anchor?.getAttribute('href')
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return
    const destination = new URL(href, window.location.href)
    if (destination.origin !== window.location.origin) return
    if (destination.pathname === window.location.pathname && destination.search === window.location.search) return

    setNavigationPending(true)
  }

  const isEntry = ENTRY_PREFIXES.some(p => pathname === p || pathname.startsWith(p))
  if (isEntry) return <>{children}</>

  // Player/watch screens own their controls and scrolling, so shell navigation
  // must not cover the video or the suggested list.
  const isPlayer = pathname.startsWith('/player/') || pathname.startsWith('/music/')

  const activeNavIndex = NAV.findIndex(item =>
    item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
  )
  return (
    <div className="flex min-h-svh flex-col bg-[#0b0813] text-white relative overflow-x-hidden" onClickCapture={handleShellClick}>
      {navigationPending && <div className="navigation-progress" role="status" aria-label="Loading page" />}

      {/* Keep the home feed visually clean; the ambient treatment remains on the other screens. */}
      {pathname !== '/' && <>
        <div className="shell-background-art home-glow animate-liquid-blob-1 fixed -top-32 -right-32 size-[500px] rounded-full bg-gradient-to-br from-fuchsia-600/25 via-purple-600/15 to-pink-500/15 blur-[120px] pointer-events-none z-0" />
        <div className="shell-background-art home-glow animate-liquid-blob-2 fixed top-1/2 -left-32 size-[450px] rounded-full bg-gradient-to-tr from-purple-600/20 via-blue-600/15 to-fuchsia-500/15 blur-[130px] pointer-events-none z-0" />

        <div className="shell-background-art water-bubble fixed top-16 -right-10 size-40 opacity-70 z-0" style={{ animationDelay: '0s' }} />
        <div className="shell-background-art water-bubble fixed top-1/3 -left-14 size-52 opacity-60 z-0" style={{ animationDelay: '-4s' }} />
        <div className="shell-background-art water-bubble fixed top-2/3 right-6 size-32 opacity-65 z-0" style={{ animationDelay: '-8s' }} />
        <div className="shell-background-art water-bubble fixed bottom-20 left-12 size-44 opacity-55 z-0" style={{ animationDelay: '-12s' }} />
      </>}

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
      <main key={pathname} className={`page-transition flex-1 ${isPlayer ? 'pb-0' : 'pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0'}`}>{children}</main>

      {/* ── Mobile bottom nav (< md) ── */}
      {!isPlayer && <nav
        ref={mobileNavRef}
        className={cn(
          'app-bottom-nav liquid-glass-pill fixed bottom-4 left-1/2 z-40 flex w-[calc(100%-24px)] max-w-md -translate-x-1/2 items-center justify-around rounded-3xl px-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl md:hidden',
          'home-liquid-nav',
        )}
        aria-label="Primary navigation"
      >
        {activeMobileNavIndex !== -1 && (
          <div
            className={cn('sliding-liquid-bubble', isSliding && 'is-sliding')}
            style={{
              left: bubbleLeft === null ? '-60px' : `${bubbleLeft}px`,
              transform: 'none',
            }}
          />
        )}

        {MOBILE_NAV.map((item, index) => {
          const active = index === activeMobileNavIndex
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              ref={(node) => {
                mobileNavItemRefs.current[index] = node
              }}
              className={cn(
                'app-bottom-nav-item relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 py-1 text-[11px] transition-colors active:scale-95',
                active ? 'font-semibold text-white' : 'text-[#a7abb4] hover:text-white',
              )}
              aria-current={active ? 'page' : undefined}
            >
              <Icon className={cn('size-5 transition-transform duration-300', active && 'scale-110 bubble-active-icon')} />
              <span>{item.label}</span>
              {item.label === 'Downloads' && activeCount > 0 && (
                <span className="absolute left-1/2 top-0 ml-2 flex size-4 items-center justify-center rounded-full bg-[#ff4f5f] text-[9px] font-bold text-white ring-2 ring-[#17191d]">
                  {activeCount}
                </span>
              )}
            </Link>
          )
        })}
      </nav>}
    </div>
  )
}
