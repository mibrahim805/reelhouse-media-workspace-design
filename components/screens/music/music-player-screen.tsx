'use client'

import { useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import { useDownloads } from '@/components/download-store'
import { useLibrary } from '@/components/library-store'
import Link from 'next/link'
import { ArrowDown, MoreHorizontal } from 'lucide-react'
import { useMedia } from '@/components/media-state'
import { ImmersiveAudioPlayer } from '@/components/player/immersive-audio-player'

export function MusicPlayerScreen() {
  const { id } = useParams<{ id: string }>()
  const { downloads } = useDownloads()
  const { favorites, toggleFavorite } = useLibrary()
  const { open } = useMedia()
  const item = downloads.find(download => download.id === id && download.status === 'completed')
  const source = item?.fileUrl ? { type: 'local-audio' as const, id: item.id, title: item.title, src: item.fileUrl, artwork: item.thumbnail, artist: item.channel } : null
  const preparedKey = item?.fileUrl ? `${item.id}:${item.fileUrl}` : ''
  const preparedRef = useRef('')

  useEffect(() => {
    if (!item?.fileUrl || preparedRef.current === preparedKey) return
    preparedRef.current = preparedKey
    open(item)
  }, [item, open, preparedKey])

  if (!source) return <main className="music-player-page"><div className="music-player-empty"><h1 className="text-lg font-semibold">Track unavailable</h1><p className="mt-2 text-sm text-white/55">Only completed backend audio files can be played here.</p><Link href="/library/music" className="mt-5 inline-flex rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white">Back to music</Link></div></main>

  return (
    <main className="music-player-page">
      <div className="music-player-orb music-player-orb-one" />
      <div className="music-player-orb music-player-orb-two" />
      <div className="music-player-surface">
        <header className="music-player-header">
          <Link href="/library/music" className="music-header-button" aria-label="Back to music library"><ArrowDown className="size-5" /></Link>
          <span className="music-header-title">Now Playing</span>
          <button className="music-header-button" aria-label="More player options"><MoreHorizontal className="size-5" /></button>
        </header>
        <ImmersiveAudioPlayer source={source} favorited={favorites.includes(source.id)} onToggleFavorite={() => toggleFavorite(source.id)} />
      </div>
    </main>
  )
}

export const MusicPlayer = MusicPlayerScreen
