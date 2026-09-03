'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Play, Search } from 'lucide-react'
import { VideoFeedSection } from '@/components/media/video-feed-section'
import { useOnlineVideoDownload } from '@/hooks/use-online-video-download'
import { searchYouTube } from '@/lib/backend-api'
import { useNetworkStatus } from '@/lib/network-status'
import { readRecentSearches } from '@/lib/recent-searches'
import { useDownloads, type DownloadItem } from '@/components/download-store'
import type { OnlineVideo } from '@/types/media'

type Filter = 'all' | 'online' | 'downloaded'
const isAudio = (item: DownloadItem) => /\.(mp3|m4a|aac|wav|ogg|flac)$/i.test(item.filename || '') || item.qualityValue === 'audio'

function DownloadedCard({ item }: { item: DownloadItem }) {
  const href = `${isAudio(item) ? '/music' : '/player'}/${encodeURIComponent(item.id)}`
  return <Link href={href} className="group block min-w-0"><div className="relative aspect-video overflow-hidden rounded-2xl bg-[#151515]"><img src={item.thumbnail || '/placeholder.svg'} alt="" className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" /><span className="absolute bottom-2 right-2 rounded-md bg-black/80 px-1.5 py-0.5 text-[11px] font-semibold text-white">{isAudio(item) ? 'Audio' : 'Local'}</span></div><h3 className="mt-3 line-clamp-2 text-[15px] font-semibold leading-snug text-white group-hover:text-primary">{item.title}</h3><p className="mt-1 text-[12px] text-[#a3a3a3]">Available offline</p></Link>
}

function mergeResults(groups: Array<{ query: string; videos: OnlineVideo[] }>) {
  const seen = new Set<string>()
  const merged: OnlineVideo[] = []
  for (let index = 0; index < 6; index += 1) for (const group of groups) {
    const video = group.videos[index]
    if (video && video.id && !seen.has(video.id)) { seen.add(video.id); merged.push(video) }
  }
  return merged
}

export function HomeScreen() {
  const online = useNetworkStatus()
  const { downloads } = useDownloads()
  const [recentSearches, setRecentSearches] = useState<string[]>([])
  const [recommendations, setRecommendations] = useState<OnlineVideo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [reload, setReload] = useState(0)
  const download = useOnlineVideoDownload()
  const completed = useMemo(() => downloads.filter(item => item.status === 'completed'), [downloads])
  const visibleOnline = filter === 'downloaded' ? [] : recommendations
  const visibleDownloads = filter === 'online' ? [] : completed

  useEffect(() => {
    const stored = readRecentSearches()
    setRecentSearches(stored)
    if (!online || stored.length === 0) { setRecommendations([]); setLoading(false); setError(''); return }
    let cancelled = false
    setLoading(true)
    setError('')
    void Promise.all(stored.map(async query => ({ query, videos: await searchYouTube(query, 6) })))
      .then(groups => { if (!cancelled) setRecommendations(mergeResults(groups)) })
      .catch(reason => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Unable to load your feed.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [online, reload])

  const chips: Array<{ value: Filter; label: string }> = [{ value: 'all', label: 'All' }, { value: 'online', label: 'Online' }, { value: 'downloaded', label: 'Downloaded' }]
  return <main className="mx-auto w-full max-w-[1240px] overflow-hidden px-4 pb-32 sm:px-6 md:pb-12">
    <header className="flex h-16 items-center justify-between"><Link href="/" className="flex items-center gap-2" aria-label="My UTube home"><span className="flex size-8 items-center justify-center rounded-[10px] bg-primary shadow-[0_0_22px_rgba(139,92,246,.25)]"><Play className="size-4 fill-white text-white" /></span><span className="text-[18px] font-bold tracking-[-.03em] text-white">My UTube</span></Link><Link href="/search" className="flex size-11 items-center justify-center rounded-full text-[#a3a3a3] hover:bg-[#151515] hover:text-white" aria-label="Search online videos"><Search className="size-[19px]" /></Link></header>
    <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1" aria-label="Home filters">{chips.map(chip => <button key={chip.value} type="button" onClick={() => setFilter(chip.value)} className={`shrink-0 rounded-full border px-4 py-2 text-xs font-semibold ${filter === chip.value ? 'border-primary bg-primary/15 text-primary' : 'border-[#292929] bg-[#151515] text-[#a3a3a3]'}`}>{chip.label}</button>)}</div>
    {!online && <div className="mt-6 rounded-2xl border border-dashed border-[#292929] px-4 py-5 text-center"><p className="text-sm font-semibold text-white">You&apos;re offline</p><p className="mt-1 text-xs text-[#a3a3a3]">Search and online videos require an internet connection. Your downloaded and device media are still available in Library.</p></div>}
    {online && recentSearches.length === 0 && filter !== 'downloaded' && <div className="mt-8 rounded-2xl border border-dashed border-[#292929] px-4 py-8 text-center"><p className="text-sm font-semibold text-white">Search for videos to build your feed.</p><Link href="/search" className="mt-3 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white"><Search className="size-3.5" /> Open Search</Link></div>}
    {filter !== 'downloaded' && recentSearches.length > 0 && <VideoFeedSection title="For you" videos={visibleOnline} loading={loading} error={error} onRetry={() => setReload(value => value + 1)} onDownload={download.begin} getDownloadState={download.getDownloadState} />}
    {filter !== 'online' && <section className="mt-8"><div className="mb-3 flex items-center justify-between"><h2 className="text-[18px] font-semibold tracking-[-.02em] text-white">Downloaded</h2><Link href="/library" className="text-xs font-medium text-primary">Open Library</Link></div>{visibleDownloads.length ? <div className="grid gap-x-5 gap-y-7 md:grid-cols-2 xl:grid-cols-3">{visibleDownloads.map(item => <DownloadedCard key={item.id} item={item} />)}</div> : <p className="rounded-2xl border border-dashed border-[#292929] px-4 py-5 text-center text-xs text-[#737373]">No downloaded media yet.</p>}</section>}
    {download.dialogs}
  </main>
}
