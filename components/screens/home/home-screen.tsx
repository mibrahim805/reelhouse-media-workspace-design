'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Bell, Play, Search, Music2, Download, CheckCircle2, User, Pencil, X } from 'lucide-react'
import { useOnlineVideoDownload } from '@/hooks/use-online-video-download'
import { searchYouTube } from '@/lib/backend-api'
import { useNetworkStatus } from '@/lib/network-status'
import { readRecentSearches } from '@/lib/recent-searches'
import { useDownloads, type DownloadItem } from '@/components/download-store'
import type { OnlineVideo } from '@/types/media'

type Filter = 'all' | 'new' | 'trending' | 'top' | 'downloaded'

const FEATURED_CARDS = [
  {
    id: 'asap-rocky',
    artist: 'A$AP Rocky',
    songsCount: '132 songs',
    image: '/images/home/asap_rocky.png',
    badge: '🔥 In Charts',
    tall: true,
    videoId: 'Kbj2Zmg1776',
    title: 'A$AP Rocky - Praise The Lord (Da Shine) ft. Skepta',
    duration: '3:25',
  },
  {
    id: 'kendrick-lamar',
    artist: 'Kendrick Lamar',
    songsCount: '98 songs',
    image: '/images/home/kendrick_lamar.png',
    badge: null,
    tall: false,
    videoId: 'H58vbez_m4E',
    title: 'Kendrick Lamar - Not Like Us',
    duration: '4:34',
  },
  {
    id: 'linkin-park',
    artist: 'Linkin Park',
    songsCount: '72 songs',
    image: '/images/home/linkin_park.png',
    badge: '🌟 Gold Record',
    tall: false,
    videoId: 'eVTXPUF4Oz4',
    title: 'Linkin Park - In The End (Official HD Video)',
    duration: '3:36',
  },
  {
    id: 'taylor-swift',
    artist: 'Taylor Swift',
    songsCount: '48 songs',
    image: '/images/home/taylor_swift.png',
    badge: null,
    tall: true,
    videoId: 'ic8j13U_FS8',
    title: 'Taylor Swift - Cruel Summer (Official Audio)',
    duration: '2:58',
  },
]

const isAudio = (item: DownloadItem) =>
  /\.(mp3|m4a|aac|wav|ogg|flac)$/i.test(item.filename || '') || item.qualityValue === 'audio'

function mergeResults(groups: Array<{ query: string; videos: OnlineVideo[] }>) {
  const seen = new Set<string>()
  const merged: OnlineVideo[] = []
  for (let index = 0; index < 6; index += 1) {
    for (const group of groups) {
      const video = group.videos[index]
      if (video && video.id && !seen.has(video.id)) {
        seen.add(video.id)
        merged.push(video)
      }
    }
  }
  return merged
}

type FeaturedCard = (typeof FEATURED_CARDS)[number]

function FeaturedVideoCard({
  card,
  playing,
  onPlay,
  onDownload,
}: {
  card: FeaturedCard
  playing: boolean
  onPlay: () => void
  onDownload: () => void
}) {
  const aspect = card.tall ? 'aspect-[3/4]' : 'aspect-[16/10]'

  return (
    <article
      className={`home-card liquid-glass-card card-3d-effect group relative overflow-hidden rounded-3xl preserve-3d ${aspect}`}
      onClick={() => { if (!playing) onPlay() }}
    >
      {playing ? (
        <iframe
          src={`https://www.youtube.com/embed/${card.videoId}?playsinline=1&rel=0&modestbranding=1`}
          title={card.title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          className="size-full border-0"
        />
      ) : (
        <>
          <img
            src={card.image}
            alt={card.artist}
            className="home-card-image size-full object-cover transition-transform duration-700 group-hover:scale-105"
            loading="lazy"
            decoding="async"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onPlay()
            }}
            aria-label={`Play ${card.title}`}
            className="absolute inset-0 z-10 flex items-center justify-center translate-z-30"
          >
            <span className="flex size-12 items-center justify-center rounded-full liquid-glow-btn text-white shadow-xl group-hover:scale-110 transition-transform duration-300">
              <Play className="ml-0.5 size-6 fill-white" />
            </span>
          </button>
        </>
      )}

      {card.badge && (
        <div className="absolute left-3 top-3 z-20 rounded-full border border-white/30 bg-black/50 px-3 py-1 text-[11px] font-semibold text-white backdrop-blur-xl shadow-lg translate-z-20">
          {card.badge}
        </div>
      )}

      <button
        type="button"
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          onDownload()
        }}
        aria-label={`Download ${card.artist}`}
        className="absolute right-3 top-3 z-20 flex size-9 items-center justify-center rounded-full border border-white/30 bg-black/50 text-white/90 backdrop-blur-xl transition-all hover:bg-[#d946ef] hover:border-[#d946ef] hover:text-white hover:scale-110 active:scale-95 shadow-lg translate-z-20"
      >
        <Download className="size-4" />
      </button>

      <div className="pointer-events-none absolute bottom-3 left-3 right-3 z-20 translate-z-30">
        <h2 className="text-base font-bold tracking-tight text-white sm:text-lg drop-shadow-md">{card.artist}</h2>
        <p className="text-xs text-white/80 drop-shadow">{card.songsCount} · {card.duration}</p>
      </div>
    </article>
  )
}

export function HomeScreen() {
  const online = useNetworkStatus()
  const { downloads, activeCount, setPanelOpen, panelOpen } = useDownloads()
  const [recommendations, setRecommendations] = useState<OnlineVideo[]>([])
  const [playingFeaturedId, setPlayingFeaturedId] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [userName, setUserName] = useState<string>('')
  const [isNameModalOpen, setIsNameModalOpen] = useState(false)
  const [inputName, setInputName] = useState('')

  const download = useOnlineVideoDownload()
  const completed = useMemo(() => downloads.filter(item => item.status === 'completed'), [downloads])

  useEffect(() => {
    const savedName = localStorage.getItem('myutube_user_name')
    if (savedName && savedName.trim()) {
      setUserName(savedName.trim())
    } else {
      setIsNameModalOpen(true)
    }

    const stored = readRecentSearches()
    const isAndroidApp = /ReelhouseAndroid\//i.test(navigator.userAgent)
    if (!online || isAndroidApp) {
      setRecommendations([])
      return
    }
    const queries = stored.length > 0 ? stored : ['A$AP Rocky', 'Kendrick Lamar', 'Taylor Swift']
    let cancelled = false
    void Promise.all(queries.map(async query => ({ query, videos: await searchYouTube(query, 4) })))
      .then(groups => {
        if (!cancelled) setRecommendations(mergeResults(groups))
      })
      .catch(() => {
        if (!cancelled) setRecommendations([])
      })
    return () => {
      cancelled = true
    }
  }, [online])

  const handleSaveName = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const trimmed = inputName.trim()
    const finalName = trimmed || userName || 'Ibrahim'
    setUserName(finalName)
    localStorage.setItem('myutube_user_name', finalName)
    setIsNameModalOpen(false)
  }

  return (
    <main className="home-screen relative min-h-screen bg-[#0b0813] text-white px-4 pt-5 pb-36 sm:px-6 md:pb-16 max-w-[1240px] mx-auto overflow-hidden">
      {/* ── Background Ambient Lighting & Liquid Wave Graphics ── */}
      <div className="home-glow animate-liquid-blob-1 absolute -top-24 -right-24 size-[450px] rounded-full bg-gradient-to-br from-fuchsia-600/30 via-purple-600/20 to-pink-500/20 blur-[110px] pointer-events-none" />
      <div className="home-glow animate-liquid-blob-2 absolute top-1/3 -left-24 size-[400px] rounded-full bg-gradient-to-tr from-purple-600/20 via-blue-600/15 to-fuchsia-500/20 blur-[120px] pointer-events-none" />

      {/* ── Background Floating 3D Water Bubbles ── */}
      <div className="water-bubble top-12 -right-8 size-36 opacity-70" style={{ animationDelay: '0s' }} />
      <div className="water-bubble top-1/4 -left-12 size-48 opacity-60" style={{ animationDelay: '-4s' }} />
      <div className="water-bubble top-1/2 right-4 size-28 opacity-65" style={{ animationDelay: '-8s' }} />
      <div className="water-bubble top-3/4 left-10 size-40 opacity-55" style={{ animationDelay: '-12s' }} />
      <div className="water-bubble bottom-10 right-16 size-32 opacity-60" style={{ animationDelay: '-6s' }} />

      {/* Concentric circular background line waves (Top-Left) */}
      <svg
        className="absolute top-0 left-0 w-80 h-80 opacity-15 pointer-events-none text-white/20"
        viewBox="0 0 400 400"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle cx="80" cy="80" r="60" stroke="currentColor" strokeWidth="1" />
        <circle cx="80" cy="80" r="110" stroke="currentColor" strokeWidth="1" />
        <circle cx="80" cy="80" r="160" stroke="currentColor" strokeWidth="1" />
        <circle cx="80" cy="80" r="210" stroke="currentColor" strokeWidth="1" />
        <circle cx="80" cy="80" r="260" stroke="currentColor" strokeWidth="1" />
      </svg>

      {/* ── Top Header Bar ── */}
      <header className="relative z-10 flex items-center justify-between">
        {/* User Profile Avatar with vibrant liquid ring */}
        <button
          type="button"
          onClick={() => {
            setInputName(userName || 'Ibrahim')
            setIsNameModalOpen(true)
          }}
          aria-label="User Profile"
          className="group relative block text-left"
        >
          <div className="size-12 rounded-full p-[2px] bg-gradient-to-tr from-pink-500 via-fuchsia-500 to-purple-500 shadow-[0_0_20px_rgba(217,70,239,0.4)] transition-transform duration-300 group-hover:scale-105">
            <div className="size-full rounded-full overflow-hidden bg-[#181324] flex items-center justify-center">
              <img
                src="/placeholder-user.jpg"
                alt={userName || 'User Profile'}
                className="size-full object-cover"
                loading="lazy"
                decoding="async"
              />
            </div>
          </div>
        </button>

        {/* Action Icon Buttons */}
        <div className="flex items-center gap-3">
          {/* Search Button */}
          <Link
            href="/search"
            aria-label="Search"
            className="liquid-glass-pill flex size-11 items-center justify-center rounded-full text-white/80 transition-all duration-300 hover:text-white hover:scale-105 active:scale-95"
          >
            <Search className="size-5" />
          </Link>

          {/* Downloads / Notifications Button */}
          <button
            type="button"
            onClick={() => setPanelOpen(!panelOpen)}
            aria-label="Downloads panel"
            className="liquid-glass-pill relative flex size-11 items-center justify-center rounded-full text-white/80 transition-all duration-300 hover:text-white hover:scale-105 active:scale-95"
          >
            <Bell className="size-5" />
            {activeCount > 0 && (
              <span className="absolute top-2 right-2 size-2.5 rounded-full bg-[#d946ef] ring-2 ring-[#0b0813] animate-pulse shadow-[0_0_8px_rgba(217,70,239,0.8)]" />
            )}
          </button>
        </div>
      </header>

      {/* ── Greeting Title ── */}
      <div className="relative z-10 mt-5 mb-5 flex items-center gap-3">
        <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl drop-shadow-md">
          Hello, <span className="bg-gradient-to-r from-fuchsia-600 via-pink-500 to-purple-600 dark:from-fuchsia-400 dark:via-pink-400 dark:to-purple-400 bg-clip-text text-transparent">{userName || 'Ibrahim'}</span>
        </h1>
        <button
          type="button"
          onClick={() => {
            setInputName(userName || 'Ibrahim')
            setIsNameModalOpen(true)
          }}
          aria-label="Edit Name"
          className="rounded-full p-1.5 text-white/70 hover:bg-black/10 dark:hover:bg-white/10 hover:text-white transition-all"
        >
          <Pencil className="size-4" />
        </button>
      </div>

      {/* ── First-Time User Name Setup Modal ── */}
      {isNameModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xl px-4 animate-in fade-in duration-300">
          <div className="liquid-glass-card w-full max-w-md rounded-3xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-2xl bg-[#d946ef]/20 border border-[#d946ef]/30 text-[#d946ef]">
                  <User className="size-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Welcome to My UTube</h2>
                  <p className="text-xs text-white/70">Enter your name to customize your app</p>
                </div>
              </div>
              {userName && (
                <button
                  type="button"
                  onClick={() => setIsNameModalOpen(false)}
                  className="rounded-full p-1.5 text-white/60 hover:bg-black/10 dark:hover:bg-white/10 hover:text-white"
                >
                  <X className="size-5" />
                </button>
              )}
            </div>

            <form onSubmit={handleSaveName} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-white/70 mb-1.5">Your Name</label>
                <input
                  type="text"
                  value={inputName}
                  onChange={(e) => setInputName(e.target.value)}
                  placeholder="e.g. Ibrahim"
                  autoFocus
                  className="liquid-glass-input w-full rounded-2xl px-4 py-3.5 text-sm font-medium focus:outline-none transition-all"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full rounded-2xl liquid-glow-btn py-3.5 text-sm font-bold text-white transition-all active:scale-95"
                >
                  Save Name & Continue
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Offline Banner Alert ── */}
      {!online && (
        <div className="liquid-glass-card relative z-10 mb-6 rounded-2xl p-4 text-center">
          <p className="text-sm font-semibold text-white">You&apos;re offline</p>
          <p className="mt-1 text-xs text-white/70">
            Downloaded music and videos remain available in your Library.
          </p>
        </div>
      )}

      {/* ── Main Asymmetric Bento Card Grid ── */}
      {filter !== 'downloaded' && (
        <section className="relative z-10 mb-10">
          {/* Featured Artists Asymmetric 2-Column Layout */}
          <div className="grid grid-cols-2 gap-3.5 sm:gap-4">
            {/* Left Column: A$AP Rocky (Tall) + Linkin Park (Compact) */}
            <div className="flex flex-col gap-3.5 sm:gap-4">
              <FeaturedVideoCard
                card={FEATURED_CARDS[0]}
                playing={playingFeaturedId === FEATURED_CARDS[0].id}
                onPlay={() => setPlayingFeaturedId(FEATURED_CARDS[0].id)}
                onDownload={() => download.begin({
                  id: FEATURED_CARDS[0].videoId,
                  title: FEATURED_CARDS[0].title,
                  channel: FEATURED_CARDS[0].artist,
                  duration: FEATURED_CARDS[0].duration,
                  thumbnail: FEATURED_CARDS[0].image,
                  sourceUrl: `https://www.youtube.com/watch?v=${FEATURED_CARDS[0].videoId}`,
                })}
              />
              <FeaturedVideoCard
                card={FEATURED_CARDS[2]}
                playing={playingFeaturedId === FEATURED_CARDS[2].id}
                onPlay={() => setPlayingFeaturedId(FEATURED_CARDS[2].id)}
                onDownload={() => download.begin({
                  id: FEATURED_CARDS[2].videoId,
                  title: FEATURED_CARDS[2].title,
                  channel: FEATURED_CARDS[2].artist,
                  duration: FEATURED_CARDS[2].duration,
                  thumbnail: FEATURED_CARDS[2].image,
                  sourceUrl: `https://www.youtube.com/watch?v=${FEATURED_CARDS[2].videoId}`,
                })}
              />
            </div>

            {/* Right Column: Kendrick Lamar (Compact) + Taylor Swift (Tall) */}
            <div className="flex flex-col gap-3.5 sm:gap-4">
              <FeaturedVideoCard
                card={FEATURED_CARDS[1]}
                playing={playingFeaturedId === FEATURED_CARDS[1].id}
                onPlay={() => setPlayingFeaturedId(FEATURED_CARDS[1].id)}
                onDownload={() => download.begin({
                  id: FEATURED_CARDS[1].videoId,
                  title: FEATURED_CARDS[1].title,
                  channel: FEATURED_CARDS[1].artist,
                  duration: FEATURED_CARDS[1].duration,
                  thumbnail: FEATURED_CARDS[1].image,
                  sourceUrl: `https://www.youtube.com/watch?v=${FEATURED_CARDS[1].videoId}`,
                })}
              />
              <FeaturedVideoCard
                card={FEATURED_CARDS[3]}
                playing={playingFeaturedId === FEATURED_CARDS[3].id}
                onPlay={() => setPlayingFeaturedId(FEATURED_CARDS[3].id)}
                onDownload={() => download.begin({
                  id: FEATURED_CARDS[3].videoId,
                  title: FEATURED_CARDS[3].title,
                  channel: FEATURED_CARDS[3].artist,
                  duration: FEATURED_CARDS[3].duration,
                  thumbnail: FEATURED_CARDS[3].image,
                  sourceUrl: `https://www.youtube.com/watch?v=${FEATURED_CARDS[3].videoId}`,
                })}
              />
            </div>
          </div>

          {/* Dynamic Search/Recommendation Videos */}
          {recommendations.length > 0 && (
            <div className="grid grid-cols-2 gap-3.5 sm:gap-4 mt-3.5 sm:mt-4">
              {recommendations.slice(0, 4).map(video => (
                <Link
                  key={video.id}
                  href={`/watch/${encodeURIComponent(video.id)}`}
                  className="home-card liquid-glass-card card-3d-effect group relative block overflow-hidden rounded-3xl preserve-3d aspect-video"
                >
                  <img
                    src={video.thumbnail || '/placeholder.svg'}
                    alt={video.title}
                    className="home-card-image size-full object-cover transition-transform duration-700 group-hover:scale-105"
                    loading="lazy"
                    decoding="async"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
                  {/* Download Button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      download.begin(video)
                    }}
                    aria-label={`Download ${video.title}`}
                    className="absolute top-2.5 right-2.5 z-20 flex size-8 items-center justify-center rounded-full bg-black/40 border border-white/25 text-white/90 backdrop-blur-xl transition-all hover:bg-[#d946ef] hover:text-white hover:border-[#d946ef] hover:scale-110 active:scale-95 shadow-lg translate-z-20"
                  >
                    <Download className="size-3.5" />
                  </button>
                  {/* Play Overlay Button */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none translate-z-30">
                    <div className="flex size-11 items-center justify-center rounded-full liquid-glow-btn text-white shadow-xl scale-90 group-hover:scale-100 transition-transform duration-300">
                      <Play className="size-5 fill-white ml-0.5" />
                    </div>
                  </div>
                  <div className="absolute bottom-2.5 left-3 right-3 translate-z-30">
                    <h3 className="line-clamp-1 text-xs sm:text-sm font-bold text-white group-hover:text-fuchsia-300 transition-colors drop-shadow-md">
                      {video.title}
                    </h3>
                    <p className="text-[11px] text-white/75 truncate">{video.channel || 'YouTube'}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── Downloaded Media Section ── */}
      {(filter === 'downloaded' || completed.length > 0) && (
        <section className="relative z-10 mt-8 mb-8">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              <CheckCircle2 className="size-5 text-[#d946ef]" />
              Downloaded
            </h2>
            <Link href="/library" className="text-xs font-semibold text-[#d946ef] hover:underline">
              Open Library
            </Link>
          </div>

          {completed.length > 0 ? (
            <div className="grid grid-cols-2 gap-3.5 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
              {completed.map(item => {
                const href = `${isAudio(item) ? '/music' : '/player'}/${encodeURIComponent(item.id)}`
                return (
                  <Link
                    key={item.id}
                    href={href}
                    className="home-card liquid-glass-card card-3d-effect group relative block overflow-hidden rounded-3xl preserve-3d aspect-video"
                  >
                    <img
                      src={item.thumbnail || '/placeholder.svg'}
                      alt={item.title}
                      className="home-card-image size-full object-cover transition-transform duration-700 group-hover:scale-105"
                      loading="lazy"
                      decoding="async"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
                    <span className="absolute top-2.5 right-2.5 rounded-full bg-black/40 border border-white/20 px-2.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur-xl shadow-md translate-z-20">
                      {isAudio(item) ? 'Audio' : 'Video'}
                    </span>
                    <div className="absolute bottom-2.5 left-3 right-3 translate-z-30">
                      <h3 className="line-clamp-1 text-xs sm:text-sm font-bold text-white group-hover:text-fuchsia-300 transition-colors drop-shadow-md">
                        {item.title}
                      </h3>
                      <p className="text-[11px] text-white/75">Downloaded offline</p>
                    </div>
                  </Link>
                )
              })}
            </div>
          ) : (
            <div className="liquid-glass-card rounded-3xl p-8 text-center border-dashed">
              <Music2 className="mx-auto size-8 text-white/50 mb-2" />
              <p className="text-sm font-semibold text-white">No downloaded media yet</p>
              <p className="mt-1 text-xs text-white/70">
                Search for any track or video to download it for offline listening.
              </p>
            </div>
          )}
        </section>
      )}

      {/* Active Download / Quality Selection Dialogs */}
      {download.dialogs}
    </main>
  )
}
