 'use client'

import { useState } from 'react'
import { Camera, Download, MoreVertical, Play, Search, Video, MonitorPlay } from 'lucide-react'
import { QualityDialog, type QualityTarget } from '@/components/quality-dialog'
import { FALLBACK_YOUTUBE_QUALITIES, type MediaVideo, type QualityOption } from '@/lib/backend-api'

const SOURCES = [
  { label: 'Youtube', icon: MonitorPlay, color: 'bg-red-500' },
  { label: 'Instagram', icon: Camera, color: 'bg-gradient-to-br from-yellow-400 via-pink-500 to-purple-600' },
  { label: 'Facebook', icon: Video, color: 'bg-blue-600' },
  { label: 'BiliBili', icon: Play, color: 'bg-sky-400' },
]

export function HeroSection({
  trending,
  feedLoading,
  feedError,
  onPasteLink,
  onSubmitUrl,
  onSearch,
  onOpenVideo,
  onDownloadVideo,
}: {
  trending: MediaVideo[]
  feedLoading: boolean
  feedError: boolean
  onPasteLink: () => void
  onSubmitUrl: (url: string) => void
  onSearch: (query: string) => void
  onOpenVideo: (video: MediaVideo) => void
  onDownloadVideo: (video: MediaVideo, quality: QualityOption) => void
}) {
  const [url, setUrl] = useState('')
  const [downloadTarget, setDownloadTarget] = useState<QualityTarget | null>(null)
  const [downloadVideo, setDownloadVideo] = useState<MediaVideo | null>(null)
  const qualities = downloadVideo?.qualities?.length ? downloadVideo.qualities : FALLBACK_YOUTUBE_QUALITIES
  return (
    <section className="mx-auto max-w-xl pb-24">
      <form onSubmit={(event) => { event.preventDefault(); const value = url.trim(); if (!value) return onPasteLink(); if (/^https?:\/\//i.test(value)) onSubmitUrl(value); else onSearch(value) }} className="flex items-center gap-1.5 rounded-full bg-white px-3 py-2.5 shadow-sm ring-1 ring-black/5">
        <Search className="size-5 text-slate-500" />
        <input value={url} onChange={(event) => setUrl(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400" placeholder="Search or enter url" />
        <button type="submit" aria-label="Open downloader"><Download className="size-6 text-slate-900" /></button>
      </form>
      <div className="mt-5 grid grid-cols-4 gap-2">
        {SOURCES.map(({ label, icon: Icon, color }) => (
          <button key={label} onClick={onPasteLink} className="flex flex-col items-center gap-2 text-xs text-slate-500">
            <span className={`flex size-11 items-center justify-center rounded-xl text-white shadow-sm ${color}`}><Icon className="size-5" /></span>
            <span className="text-[11px]">{label}</span>
          </button>
        ))}
      </div>
      <div className="mt-7 space-y-6">
        {feedLoading && <div className="h-72 animate-pulse rounded-3xl bg-slate-200" />}
        {!feedLoading && trending.map((video) => (
          <article key={video.id || video.sourceUrl} className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-black/5">
            <button onClick={() => onOpenVideo(video)} className="relative block aspect-video w-full bg-slate-200 text-left">
              <img src={video.thumbnail || '/placeholder.svg'} alt="" className="size-full object-cover" />
              <span className="absolute inset-0 flex items-center justify-center"><span className="flex size-14 items-center justify-center rounded-full bg-black/45 text-white"><Play className="size-7 fill-current" /></span></span>
              <span className="absolute bottom-3 right-3 rounded bg-black/70 px-2 py-1 text-xs text-white">{video.duration}</span>
            </button>
            <div className="flex gap-3 p-4">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-600">{video.channelInitials}</div>
              <div className="min-w-0 flex-1"><h2 className="line-clamp-2 text-sm font-bold leading-6 text-slate-900">{video.title}</h2><p className="mt-1 text-xs text-slate-500">{video.channel} · {video.platform}</p></div>
              <button onClick={() => { setDownloadVideo(video); setDownloadTarget({ title: video.title, channel: video.channel, thumbnail: video.thumbnail, source: video.platform }) }} aria-label="Download"><Download className="size-6 text-slate-500" /></button><MoreVertical className="size-6 text-slate-400" />
            </div>
          </article>
        ))}
        {!feedLoading && trending.length === 0 && <button onClick={onPasteLink} className="w-full rounded-3xl bg-white p-10 text-center text-sm text-slate-500 shadow-sm">Paste a video link to get started</button>}
      </div>
      <QualityDialog open={Boolean(downloadTarget)} target={downloadTarget} qualities={qualities} onClose={() => { setDownloadTarget(null); setDownloadVideo(null) }} onConfirm={(quality) => { if (downloadVideo) onDownloadVideo(downloadVideo, quality); setDownloadTarget(null); setDownloadVideo(null) }} />
    </section>
  )
}
