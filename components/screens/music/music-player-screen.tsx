'use client'

import { useEffect, useMemo } from 'react'
import { useParams } from 'next/navigation'
import { useDownloads } from '@/components/download-store'
import { useLibrary } from '@/components/library-store'
import { useMedia } from '@/components/media-state'
import { ReelhousePlayer } from '@/components/player/reelhouse-player'
import { PlayerShell } from '@/components/player/player-shell'

export function MusicPlayerScreen() {
  const { id } = useParams<{ id: string }>()
  const { downloads } = useDownloads()
  const { favorites, toggleFavorite } = useLibrary()
  const { open } = useMedia()
  const item = downloads.find(download => download.id === id && download.status === 'completed')
  const source = useMemo(() => item?.fileUrl ? ({ type: 'local-audio' as const, id: item.id, title: item.title, src: item.fileUrl, artwork: item.thumbnail, artist: item.channel }) : null, [item])

  useEffect(() => { if (item?.fileUrl) open(item) }, [item, open])

  if (!source) return <PlayerShell title="Music player"><div className="rounded-2xl border border-[#292929] bg-[#151515] p-6"><h1 className="text-lg font-semibold">Track unavailable</h1><p className="mt-2 text-sm text-[#a3a3a3]">Only completed backend audio files can be played here.</p></div></PlayerShell>

  return <PlayerShell title="Now playing"><ReelhousePlayer source={source} autoPlay /><div className="mt-4 flex items-start gap-3"><div className="min-w-0 flex-1"><h1 className="truncate text-lg font-bold">{source.title}</h1><p className="mt-1 text-sm text-[#a3a3a3]">{source.artist || 'Downloaded audio'}</p></div><button onClick={() => toggleFavorite(source.id)} className="rounded-xl border border-[#292929] px-3 py-2 text-sm text-white">{favorites.includes(source.id) ? 'Favorited' : 'Favorite'}</button></div></PlayerShell>
}

export const MusicPlayer = MusicPlayerScreen
