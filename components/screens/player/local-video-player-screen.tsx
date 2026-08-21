'use client'

import { useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import { useDownloads } from '@/components/download-store'
import { useMedia } from '@/components/media-state'
import { ReelhousePlayer } from '@/components/player/reelhouse-player'
import { PlayerShell } from '@/components/player/player-shell'

export function LocalVideoPlayerScreen() {
  const { id } = useParams<{ id: string }>()
  const { downloads } = useDownloads()
  const { open } = useMedia()
  const item = downloads.find(download => download.id === id && download.status === 'completed')
  const source = item?.fileUrl ? { type: 'local-video' as const, id: item.id, title: item.title, src: item.fileUrl, thumbnail: item.thumbnail, channel: item.channel } : null
  const preparedKey = item?.fileUrl ? `${item.id}:${item.fileUrl}` : ''
  const preparedRef = useRef('')

  useEffect(() => {
    if (!item?.fileUrl || preparedRef.current === preparedKey) return
    preparedRef.current = preparedKey
    open(item)
  }, [item, open, preparedKey])

  if (!source) return <PlayerShell title="Video player"><div className="rounded-2xl border border-[#292929] bg-[#151515] p-6"><h1 className="text-lg font-semibold">Media unavailable</h1><p className="mt-2 text-sm text-[#a3a3a3]">Only completed backend files can be played here.</p></div></PlayerShell>

  return <PlayerShell title={source.title}><ReelhousePlayer source={source} autoPlay /><div className="mt-4"><h1 className="text-lg font-bold leading-snug">{source.title}</h1><p className="mt-1 text-sm text-[#a3a3a3]">{source.channel || 'Downloaded video'}</p></div></PlayerShell>
}

export const RealVideoPlayer = LocalVideoPlayerScreen
