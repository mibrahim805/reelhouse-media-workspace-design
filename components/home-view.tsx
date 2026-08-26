'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Bell, CheckCircle2, ChevronRight, Download,
  Link2, Play, Search, Sparkles, WifiOff
} from 'lucide-react'
import { useDownloads, type DownloadItem } from '@/components/download-store'
import { useMedia } from '@/components/media-state'
import { useNetworkStatus } from '@/lib/network-status'
import { APP_BRAND } from '@/lib/app-brand'

const QUICK_SOURCES = [
  { id: 'yt',  label: 'YouTube',   color: '#FF0000', hint: 'youtube.com' },
  { id: 'ig',  label: 'Instagram', color: '#C13584', hint: 'instagram.com' },
  { id: 'tt',  label: 'TikTok',    color: '#69C9D0', hint: 'tiktok.com' },
  { id: 'fb',  label: 'Facebook',  color: '#1877F2', hint: 'facebook.com' },
  { id: 'x',   label: 'X',        color: '#FFFFFF', hint: 'x.com' },
  { id: 'more',label: 'More',      color: '#8B5CF6', hint: '' },
]

export function HomeView() {
  const router = useRouter()
  const [url, setUrl] = useState('')
  const [discover, setDiscover] = useState<HomeDiscoverResult[]>([])
  const [discoverConfigured, setDiscoverConfigured] = useState<boolean | null>(null)
  const { downloads, activeCount, completedCount } = useDownloads()
  const { open } = useMedia()
  const online = useNetworkStatus()

  useEffect(() => {
    if (!online) { setDiscoverConfigured(false); return }
    fetch('/api/search?type=trending&maxResults=8')
      .then(r => r.json())
      .then(data => {
        // SW returns {error:'offline'} when network is down
        if (data.error === 'offline') { setDiscoverConfigured(false); return }
        setDiscover(data.results || [])
        setDiscoverConfigured(Boolean(data.configured))
      })
      .catch(() => setDiscoverConfigured(false))
  }, [online])

  const completed = downloads.filter(d => d.status === 'completed')
  const active    = downloads.filter(d => ['queued','downloading','processing'].includes(d.status))

  const analyze = () =>
    router.push(url.trim() ? `/downloader?url=${encodeURIComponent(url.trim())}` : '/downloader')

  const paste = async () => {
    try { const t = await navigator.clipboard.readText(); if (t) setUrl(t) } catch { /* denied */ }
  }

  return (
    <main className="w-full pb-28">

      {/* ── Top bar ── */}
      <header className="flex items-center justify-between px-4 pt-5 pb-3">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-xl bg-primary">
            <Play className="size-4 fill-white text-white" />
          </span>
          <span className="text-[18px] font-bold tracking-tight text-white">{APP_BRAND.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex size-9 items-center justify-center rounded-full border border-[#292929] bg-[#151515] text-[#a3a3a3] hover:text-white" aria-label="Notifications">
            <Bell className="size-4" />
          </button>
          <Link href="/search" className="flex size-9 items-center justify-center rounded-full border border-[#292929] bg-[#151515] text-[#a3a3a3] hover:text-white" aria-label="Search">
            <Search className="size-4" />
          </Link>
        </div>
      </header>

      {/* ── Paste URL card ── */}
      <section className="mx-4 mt-2 overflow-hidden rounded-[20px] border border-[#292929] bg-[#111]">
        <div className="p-5">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary">
            <Sparkles className="size-3.5" /> Paste a link to download
          </span>
          <div className="mt-3 flex items-center gap-2 rounded-2xl border border-[#292929] bg-black px-3 py-1 focus-within:border-primary/60">
            <Link2 className="size-4 shrink-0 text-[#a3a3a3]" />
            <input
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && analyze()}
              placeholder="Paste video link…"
              className="min-w-0 flex-1 bg-transparent py-2.5 text-sm text-white outline-none placeholder:text-[#a3a3a3]"
              inputMode="url"
            />
            <button
              onClick={paste}
              className="shrink-0 rounded-lg bg-[#1d1d1d] px-3 py-2 text-[12px] font-semibold text-[#a3a3a3] hover:text-white"
            >
              Paste
            </button>
          </div>
          <button
            onClick={analyze}
            disabled={!online}
            title={!online ? 'No internet connection' : undefined}
            className="mt-3 w-full rounded-xl bg-primary py-3 text-sm font-bold text-white hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {online ? 'Analyze & Download' : (
              <span className="flex items-center justify-center gap-2">
                <WifiOff className="size-4" /> Offline — connect to download
              </span>
            )}
          </button>
        </div>
      </section>

      {/* ── Quick sources ── */}
      <section className="mt-5 px-4">
        <SectionRow title="Quick Download" />
        <div className="no-scrollbar -mx-0 flex gap-3 overflow-x-auto pb-1">
          {QUICK_SOURCES.map(src => (
            <button
              key={src.id}
              onClick={() => {
                if (src.id === 'more') { router.push('/downloader'); return }
                setUrl(`https://${src.hint}/`)
              }}
              className="flex shrink-0 flex-col items-center gap-2"
            >
              <span
                className="flex size-12 items-center justify-center rounded-2xl border border-[#292929] bg-[#151515] text-[15px] font-extrabold"
                style={{ color: src.color }}
              >
                {src.label.charAt(0)}
              </span>
              <span className="text-[11px] text-[#a3a3a3]">{src.label}</span>
            </button>
          ))}
        </div>
      </section>

      {/* ── Active downloads ── */}
      {active.length > 0 && (
        <section className="mt-6 px-4">
          <SectionRow title="Downloading" href="/downloads" />
          <div className="space-y-2">
            {active.slice(0, 3).map(item => (
              <ActiveCard key={item.id} item={item} />
            ))}
          </div>
        </section>
      )}

      {/* ── Continue watching ── */}
      {completed.length > 0 && (
        <section className="mt-6">
          <SectionRow title="Recently Downloaded" href="/downloads" className="px-4" />
          <div className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1">
            {completed.slice(0, 8).map(item => (
              <button
                key={item.id}
                onClick={() => open(item)}
                className="group shrink-0 snap-start text-left"
                style={{ width: '72vw', maxWidth: 280 }}
              >
                <div className="relative aspect-video overflow-hidden rounded-2xl bg-[#151515]">
                  <img src={item.thumbnail || '/placeholder.svg'} alt="" className="size-full object-cover" />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/30">
                    <Play className="size-8 fill-white text-white opacity-0 drop-shadow transition-opacity group-hover:opacity-100" />
                  </div>
                </div>
                <p className="mt-2 line-clamp-2 text-[13px] font-semibold leading-snug text-white">{item.title}</p>
                <p className="mt-0.5 truncate text-[12px] text-[#a3a3a3]">{item.source} · {item.size}</p>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Online discovery stays separate from downloaded media. */}
      <section className="mt-7">
        <SectionRow title="Trending / Discover" href="/explore" className="px-4" />
        {discoverConfigured === false ? (
          <p className="px-4 text-xs text-[#a3a3a3]">Online discovery is unavailable until a provider is configured.</p>
        ) : discover.length > 0 ? (
          <div className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto px-4">
            {discover.slice(0, 6).map(item => (
              <a key={item.videoId} href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="w-[72vw] max-w-[280px] shrink-0 snap-start">
                <div className="relative aspect-video overflow-hidden rounded-2xl bg-[#151515]"><img src={item.thumbnail} alt="" className="size-full object-cover" /><span className="absolute bottom-2 right-2 rounded bg-black/80 px-1.5 py-0.5 text-[11px]">{item.duration || ''}</span></div>
                <p className="mt-2 line-clamp-2 text-[13px] font-semibold">{item.title}</p>
                <p className="mt-0.5 truncate text-xs text-[#a3a3a3]">{item.channel}</p>
              </a>
            ))}
          </div>
        ) : null}
      </section>

      {/* ── Discover / Explore CTA ── */}
      <section className="mx-4 mt-6 overflow-hidden rounded-[20px] border border-[#292929] bg-[#111] p-5">
        <div className="flex items-start gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Search className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-white">Discover new content</p>
            <p className="mt-0.5 text-sm text-[#a3a3a3]">Search millions of videos online</p>
          </div>
          <Link href="/search" className="flex items-center gap-1 text-sm font-semibold text-primary">
            Search <ChevronRight className="size-4" />
          </Link>
        </div>
      </section>

      <section className="mx-4 mt-3 flex items-center gap-3 rounded-2xl border border-primary/25 bg-primary/10 p-4">
        <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-white"><Play className="size-5 fill-current" /></span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-white">YouTube Workspace</p>
          <p className="mt-0.5 text-xs text-[#a3a3a3]">Browse, search, and watch online videos</p>
        </div>
        <Link href="/youtube" className="rounded-xl bg-primary px-3 py-2 text-xs font-bold text-white">Open</Link>
      </section>

      {/* ── Empty state ── */}
      {!completed.length && !active.length && (
        <section className="mx-4 mt-6">
          <div className="flex flex-col items-center rounded-3xl border border-dashed border-[#292929] px-5 py-14 text-center">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-[#1d1d1d]">
              <Download className="size-6 text-[#a3a3a3]" />
            </span>
            <h3 className="mt-4 text-base font-bold text-white">Your library starts here</h3>
            <p className="mt-2 max-w-xs text-sm text-[#a3a3a3]">Paste a video link above or tap Explore to discover something to download.</p>
            <div className="mt-5 flex gap-3">
              <Link href="/downloader" className="flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white">
                <Link2 className="size-4" /> Paste Link
              </Link>
              <Link href="/explore" className="flex h-10 items-center gap-2 rounded-xl border border-[#292929] bg-[#151515] px-4 text-sm font-semibold text-white">
                <Search className="size-4" /> Explore
              </Link>
            </div>
          </div>
        </section>
      )}

    </main>
  )
}

type HomeDiscoverResult = {
  videoId: string
  title: string
  channel: string
  thumbnail: string
  duration: string | null
  sourceUrl: string
}

function SectionRow({ title, href, className }: { title: string; href?: string; className?: string }) {
  return (
    <div className={`mb-3 flex items-center justify-between ${className || ''}`}>
      <h2 className="text-[16px] font-bold text-white">{title}</h2>
      {href && (
        <Link href={href} className="flex items-center gap-0.5 text-[13px] font-medium text-primary">
          See all <ChevronRight className="size-3.5" />
        </Link>
      )}
    </div>
  )
}

function ActiveCard({ item }: { item: DownloadItem }) {
  const failed = ['failed','interrupted','canceled'].includes(item.status)
  return (
    <div className="flex gap-3 rounded-2xl border border-[#292929] bg-[#151515] p-3">
      <img src={item.thumbnail || '/placeholder.svg'} alt="" className="h-14 w-24 shrink-0 rounded-xl object-cover" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-white">{item.title}</p>
        <p className={`mt-0.5 text-xs capitalize ${failed ? 'text-destructive' : 'text-[#a3a3a3]'}`}>
          {item.status}{item.speed ? ` · ${(item.speed / 1024 / 1024).toFixed(1)} MB/s` : ''}
        </p>
        {!failed && (
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#1d1d1d]">
            <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${item.progress}%` }} />
          </div>
        )}
      </div>
      <span className="shrink-0 text-xs font-bold text-primary">{Math.round(item.progress)}%</span>
    </div>
  )
}

function StatCard({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-2xl border border-[#292929] bg-[#151515] p-4 text-center">
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="mt-0.5 text-[11px] text-[#a3a3a3]">{label}</p>
    </div>
  )
}
