'use client'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useMemo, useRef, useState } from 'react'
import {
  ArrowLeft, ChevronRight, Clock, Disc3, GripVertical,
  Heart, ListMusic, Music2, Pause, Play, Plus, Search,
  Trash2, Video
} from 'lucide-react'
import { useDownloads, type DownloadItem } from '@/components/download-store'
import { useLibrary } from '@/components/library-store'

const isAudio = (d: DownloadItem) =>
  /\.(mp3|m4a|aac|wav|ogg)$/i.test(d.filename || '') || d.qualityValue === 'audio'

function useAllLocalMedia() {
  const { downloads } = useDownloads()
  const { localMedia } = useLibrary()
  const items = [...downloads.filter(d => d.status === 'completed'), ...localMedia.downloads, ...localMedia.videos, ...localMedia.music] as unknown as DownloadItem[]
  return items.filter((item, index, list) => list.findIndex(other => other.id === item.id) === index)
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto w-full max-w-3xl px-4 pb-28 pt-5 sm:px-5">{children}</main>
}

function Head({
  title, subtitle, back = false, action,
}: { title: string; subtitle?: string; back?: boolean; action?: React.ReactNode }) {
  const router = useRouter()
  return (
    <header className="mb-5 flex items-center gap-3">
      {back && (
        <button
          onClick={() => router.back()}
          className="flex size-9 shrink-0 items-center justify-center rounded-full border border-[#292929] bg-[#151515] text-[#a3a3a3] hover:text-white"
        >
          <ArrowLeft className="size-4" />
        </button>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="text-[24px] font-bold tracking-tight text-white">{title}</h1>
        {subtitle && <p className="mt-0.5 text-[13px] text-[#a3a3a3]">{subtitle}</p>}
      </div>
      {action}
    </header>
  )
}

function Empty({
  title, text, icon = <Disc3 />,
}: { title: string; text: string; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-3xl border border-dashed border-[#292929] py-14 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-[#151515] text-[#a3a3a3]">{icon}</span>
      <h2 className="mt-4 font-semibold text-white">{title}</h2>
      <p className="mt-1 max-w-xs text-sm text-[#a3a3a3]">{text}</p>
    </div>
  )
}

function MediaRow({ item, remove }: { item: DownloadItem; remove?: () => void }) {
  const { favorites, toggleFavorite, playlists, addToPlaylist } = useLibrary()
  return (
    <article className="flex items-center gap-3 rounded-2xl border border-[#292929] bg-[#151515] p-3">
      <Link href={`${isAudio(item) ? '/music' : '/player'}/${encodeURIComponent(item.id)}`} className="relative h-16 w-24 shrink-0 overflow-hidden rounded-xl bg-[#1d1d1d]">
        <img src={item.thumbnail || '/placeholder.svg'} alt="" className="size-full object-cover" />
        <span className="absolute inset-0 flex items-center justify-center bg-black/30">
          <Play className="size-5 fill-white text-white" />
        </span>
      </Link>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-white">{item.title}</p>
        <p className="mt-0.5 text-xs text-[#a3a3a3]">{isAudio(item) ? 'Audio' : 'Video'} · {item.size}</p>
      </div>
      <button
        onClick={() => toggleFavorite(item.id)}
        className={`flex size-8 items-center justify-center rounded-full hover:bg-[#1d1d1d] ${favorites.includes(item.id) ? 'text-primary' : 'text-[#a3a3a3]'}`}
        aria-label="Favorite"
      >
        <Heart className={`size-4 ${favorites.includes(item.id) ? 'fill-current' : ''}`} />
      </button>
      {playlists[0] && (
        <button
          onClick={() => addToPlaylist(playlists[0].id, item.id)}
          className="flex size-8 items-center justify-center rounded-full text-[#a3a3a3] hover:bg-[#1d1d1d] hover:text-white"
          aria-label="Add to playlist"
        >
          <ListMusic className="size-4" />
        </button>
      )}
      {remove && (
        <button
          onClick={remove}
          className="flex size-8 items-center justify-center rounded-full text-destructive hover:bg-[#1d1d1d]"
        >
          <Trash2 className="size-4" />
        </button>
      )}
    </article>
  )
}

/* ── 21 Library Hub ── */
export function LibraryHub() {
  const completed = useAllLocalMedia()
  const { favorites, playlists, history, localMedia, refreshLocalMedia } = useLibrary()
  const videos = completed.filter(d => !isAudio(d))
  const music = completed.filter(isAudio)
  return (
    <Shell>
      <Head
        title="Library"
        subtitle={localMedia.permissionRequired ? 'Allow device media access to see videos and music on this phone.' : 'Downloaded and device media'}
        action={
          <Link href="/search?scope=library" className="flex size-9 items-center justify-center rounded-full border border-[#292929] bg-[#151515] text-[#a3a3a3] hover:text-white">
            <Search className="size-4" />
          </Link>
        }
      />
      {localMedia.permissionRequired && <div className="mb-5 rounded-2xl border border-primary/30 bg-primary/10 p-4"><p className="text-sm font-semibold text-white">Allow device media access</p><p className="mt-1 text-xs text-[#a3a3a3]">Allow my yt to access videos and music on this device so they can appear in your Library. Downloaded app media remains available.</p><button type="button" onClick={refreshLocalMedia} className="mt-3 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-white">Check permission again</button></div>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <LibTile href="/library/videos" icon={<Video />} title="Videos" value={videos.length} />
        <LibTile href="/library/music" icon={<Music2 />} title="Music" value={music.length} />
        <LibTile href="/playlists" icon={<ListMusic />} title="Playlists" value={playlists.length} />
        <LibTile href="/favorites" icon={<Heart />} title="Favorites" value={favorites.length} />
      </div>
      <section className="mt-8">
        <div className="mb-4 flex items-center">
          <h2 className="text-[17px] font-bold text-white">Recently downloaded</h2>
          <Link href="/downloads" className="ml-auto flex items-center gap-0.5 text-[13px] font-medium text-primary">
            See all <ChevronRight className="size-3.5" />
          </Link>
        </div>
        {completed.length ? (
          <div className="space-y-3">
            {completed.slice(0, 5).map(item => <MediaRow key={item.id} item={item} />)}
          </div>
        ) : (
          <Empty title="No media yet" text="Completed downloads will become your personal library." />
        )}
      </section>
      {history.length > 0 && (
        <Link href="/history" className="mt-5 flex h-11 items-center justify-center gap-2 rounded-xl border border-[#292929] bg-[#151515] text-sm font-semibold text-white">
          <Clock className="size-4" /> View playback history
        </Link>
      )}
    </Shell>
  )
}

function LibTile({ href, icon, title, value }: { href: string; icon: React.ReactNode; title: string; value: number }) {
  return (
    <Link href={href} className="rounded-2xl border border-[#292929] bg-[#151515] p-4 hover:border-primary/40">
      <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary [&>svg]:size-5">{icon}</span>
      <p className="mt-4 font-semibold text-white">{title}</p>
      <p className="mt-0.5 text-xs text-[#a3a3a3]">{value} items</p>
    </Link>
  )
}

/* ── 21 Video Library ── */
export function VideoLibrary() {
  const items = useAllLocalMedia().filter(d => !isAudio(d))
  const [sort, setSort] = useState('recent')
  const sorted = useMemo(
    () => [...items].sort((a, b) =>
      sort === 'name' ? a.title.localeCompare(b.title) :
      sort === 'size' ? parseFloat(b.size) - parseFloat(a.size) :
      b.startedAt - a.startedAt,
    ),
    [items, sort],
  )
  return (
    <Shell>
      <Head
        title="My Videos"
        back
        action={
          <select
            value={sort}
            onChange={e => setSort(e.target.value)}
            className="min-h-11 rounded-xl border border-[#292929] bg-[#151515] px-3 text-xs text-white"
          >
            <option value="recent">Recently Added</option>
            <option value="name">Name</option>
            <option value="size">Size</option>
          </select>
        }
      />
      {sorted.length ? (
        <div className="space-y-3">{sorted.map(item => <MediaRow key={item.id} item={item} />)}</div>
      ) : (
        <Empty title="No downloaded videos" text="Video downloads will appear here." icon={<Video />} />
      )}
    </Shell>
  )
}

/* ── 20 Music Library ── */
export function MusicLibrary() {
  const items = useAllLocalMedia().filter(isAudio)
  return (
    <Shell>
      <Head title="Music" subtitle="Downloaded audio files" back />
      <div className="mb-5 flex gap-2">
        {['Songs', 'Albums', 'Artists'].map((x, i) => (
          <span
            key={x}
            className={`rounded-full border px-4 py-2 text-xs font-semibold ${i === 0 ? 'border-primary bg-primary/10 text-primary' : 'border-[#292929] text-[#a3a3a3]'}`}
          >
            {x}
          </span>
        ))}
      </div>
      {items.length ? (
        <div className="space-y-3">{items.map(item => <MediaRow key={item.id} item={item} />)}</div>
      ) : (
        <Empty title="No downloaded music" text="Audio-only downloads will appear here." icon={<Music2 />} />
      )}
    </Shell>
  )
}

/* ── 19 Music Player ── */
export function MusicPlayer() {
  const { id } = useParams<{ id: string }>()
  const { downloads } = useDownloads()
  const { favorites, toggleFavorite } = useLibrary()
  const item = downloads.find(d => d.id === id && d.status === 'completed')
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)

  if (!item?.fileUrl) {
    return (
      <Shell>
        <Head title="Music Player" back />
        <Empty title="Track unavailable" text="The completed audio file could not be found." />
      </Shell>
    )
  }

  const toggle = () => {
    if (!audioRef.current) return
    if (audioRef.current.paused) void audioRef.current.play()
    else audioRef.current.pause()
  }

  const fmt = (v: number) =>
    `${Math.floor(v / 60)}:${Math.floor(v % 60).toString().padStart(2, '0')}`

  return (
    <main className="mx-auto flex min-h-[calc(100svh-56px)] max-w-sm flex-col px-6 pb-28 pt-6">
      <Head title="Now Playing" back />
      {/* Album art */}
      <div className="mt-4 aspect-square overflow-hidden rounded-[32px] bg-[#151515] shadow-2xl">
        <img src={item.thumbnail || '/placeholder.svg'} alt="" className="size-full object-cover" />
      </div>
      {/* Meta */}
      <div className="mt-8 flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[22px] font-bold text-white">{item.title}</h1>
          <p className="mt-1 truncate text-[14px] text-[#a3a3a3]">{item.channel || item.source}</p>
        </div>
        <button
          onClick={() => toggleFavorite(item.id)}
          className={`flex size-10 items-center justify-center rounded-full border border-[#292929] ${favorites.includes(item.id) ? 'text-primary' : 'text-[#a3a3a3]'}`}
        >
          <Heart className={`size-5 ${favorites.includes(item.id) ? 'fill-current' : ''}`} />
        </button>
      </div>
      {/* Audio element */}
      <audio
        ref={audioRef}
        src={item.fileUrl}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={e => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={e => setDuration(e.currentTarget.duration)}
      />
      {/* Seek */}
      <input
        type="range"
        min="0"
        max={duration || 0}
        value={time}
        onChange={e => { if (audioRef.current) audioRef.current.currentTime = Number(e.target.value) }}
        className="mt-8 w-full accent-violet-500"
        aria-label="Seek"
      />
      <div className="mt-2 flex text-xs text-[#a3a3a3]">
        <span>{fmt(time)}</span>
        <span className="ml-auto">{fmt(duration)}</span>
      </div>
      {/* Controls */}
      <div className="mt-8 flex items-center justify-center gap-8">
        <button className="text-[#a3a3a3] hover:text-white" aria-label="Previous">
          <svg className="size-7" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" /></svg>
        </button>
        <button
          onClick={toggle}
          className="flex size-16 items-center justify-center rounded-full bg-white text-black shadow-xl"
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {playing ? <Pause className="size-7 fill-current" /> : <Play className="ml-1 size-7 fill-current" />}
        </button>
        <button className="text-[#a3a3a3] hover:text-white" aria-label="Next">
          <svg className="size-7" fill="currentColor" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zm9-12v12h2V6h-2z" /></svg>
        </button>
      </div>
    </main>
  )
}

/* ── 22 Playlists ── */
export function Playlists() {
  const { playlists, createPlaylist } = useLibrary()
  const [name, setName] = useState('')
  return (
    <Shell>
      <Head title="Playlists" subtitle="Collections stored on this device" />
      <div className="mb-6 flex gap-2">
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && name.trim()) { createPlaylist(name); setName('') } }}
          placeholder="New playlist name…"
          className="min-h-11 min-w-0 flex-1 rounded-xl border border-[#292929] bg-[#151515] px-3 text-sm text-white outline-none focus:border-primary/60 placeholder:text-[#a3a3a3]"
        />
        <button
          onClick={() => { if (name.trim()) { createPlaylist(name); setName('') } }}
          className="flex h-11 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-white"
        >
          <Plus className="size-4" /> New
        </button>
      </div>
      {playlists.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {playlists.map(p => (
            <Link
              key={p.id}
              href={`/playlists/${p.id}`}
              className="flex items-center gap-4 rounded-2xl border border-[#292929] bg-[#151515] p-4 hover:border-primary/40"
            >
              <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <ListMusic className="size-5" />
              </span>
              <div>
                <p className="font-semibold text-white">{p.name}</p>
                <p className="text-xs text-[#a3a3a3]">{p.itemIds.length} items</p>
              </div>
              <ChevronRight className="ml-auto size-4 text-[#a3a3a3]" />
            </Link>
          ))}
        </div>
      ) : (
        <Empty title="No playlists yet" text="Create a playlist, then add downloaded media to it." icon={<ListMusic />} />
      )}
    </Shell>
  )
}

/* ── 23 Playlist Details ── */
export function PlaylistDetails() {
  const { id } = useParams<{ id: string }>()
  const { downloads } = useDownloads()
  const { playlists, removeFromPlaylist, reorderPlaylist } = useLibrary()
  const playlist = playlists.find(p => p.id === id)
  const items = (playlist?.itemIds || [])
    .map(x => downloads.find(d => d.id === x))
    .filter(Boolean) as DownloadItem[]
  if (!playlist) {
    return (
      <Shell>
        <Head title="Playlist" back />
        <Empty title="Playlist not found" text="It may have been removed." />
      </Shell>
    )
  }
  return (
    <Shell>
      <Head title={playlist.name} subtitle={`${items.length} items`} back />
      {items.length ? (
        <div className="space-y-3">
          {items.map((item, index) => (
            <div key={item.id} className="flex items-center gap-2">
              <div className="flex flex-col gap-1">
                <button
                  disabled={index === 0}
                  onClick={() => reorderPlaylist(id, index, index - 1)}
                  className="text-[#a3a3a3] disabled:opacity-30 hover:text-white"
                  aria-label="Move up"
                >
                  <GripVertical className="size-4" />
                </button>
              </div>
              <div className="min-w-0 flex-1">
                <MediaRow item={item} remove={() => removeFromPlaylist(id, item.id)} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Empty title="Playlist is empty" text="Add downloaded media from your library." icon={<ListMusic />} />
      )}
    </Shell>
  )
}

/* ── 25 Favorites ── */
export function Favorites() {
  const { downloads } = useDownloads()
  const { favorites } = useLibrary()
  const items = favorites
    .map(id => downloads.find(d => d.id === id))
    .filter(Boolean) as DownloadItem[]
  return (
    <Shell>
      <Head title="Favorites" back />
      {items.length ? (
        <div className="space-y-3">{items.map(item => <MediaRow key={item.id} item={item} />)}</div>
      ) : (
        <Empty title="No favorites yet" text="Tap the heart on downloaded media to keep it here." icon={<Heart />} />
      )}
    </Shell>
  )
}

/* ── 24 History ── */
export function History() {
  const { downloads } = useDownloads()
  const { history, clearHistory } = useLibrary()
  const entries = history
    .map(h => ({ history: h, item: downloads.find(d => d.id === h.id) }))
    .filter(x => x.item) as Array<{ history: { id: string; playedAt: number; progress: number }; item: DownloadItem }>

  function dayLabel(value: number) {
    const d = new Date(value)
    const now = new Date()
    if (d.toDateString() === now.toDateString()) return 'Today'
    const yesterday = new Date(); yesterday.setDate(now.getDate() - 1)
    return d.toDateString() === yesterday.toDateString() ? 'Yesterday' : d.toLocaleDateString()
  }

  return (
    <Shell>
      <Head
        title="History"
        back
        action={
          entries.length ? (
            <button onClick={clearHistory} className="text-xs font-medium text-destructive">
              Clear
            </button>
          ) : undefined
        }
      />
      {entries.length ? (
        <div className="space-y-3">
          {entries.map(({ history: h, item }) => (
            <div key={h.id}>
              <p className="mb-1 text-[11px] text-[#a3a3a3]">
                {dayLabel(h.playedAt)} · {new Date(h.playedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
              <MediaRow item={item} />
            </div>
          ))}
        </div>
      ) : (
        <Empty title="No playback history" text="Playing downloaded media will add it here." icon={<Clock />} />
      )}
    </Shell>
  )
}
