'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Bell, Flame, Play, Search, Sparkles, Music2, Download, CheckCircle2, User, Pencil, X } from 'lucide-react'
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
    query: 'A$AP Rocky',
    artist: 'A$AP Rocky',
    songsCount: '132 songs',
    image: '/images/home/asap_rocky.png',
    badge: '🔥 In Charts',
    tall: true,
  },
  {
    id: 'kendrick-lamar',
    query: 'Kendrick Lamar',
    artist: 'Kendrick Lamar',
    songsCount: '98 songs',
    image: '/images/home/kendrick_lamar.png',
    badge: null,
    tall: false,
  },
  {
    id: 'linkin-park',
    query: 'Linkin Park',
    artist: 'Linkin Park',
    songsCount: '72 songs',
    image: '/images/home/linkin_park.png',
    badge: '🌟 Gold Record',
    tall: false,
  },
  {
    id: 'taylor-swift',
    query: 'Taylor Swift',
    artist: 'Taylor Swift',
    songsCount: '48 songs',
    image: '/images/home/taylor_swift.png',
    badge: null,
    tall: true,
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

export function HomeScreen() {
  const online = useNetworkStatus()
  const { downloads, activeCount, setPanelOpen, panelOpen } = useDownloads()
  const [recommendations, setRecommendations] = useState<OnlineVideo[]>([])
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
    // Searching three YouTube queries through the Android bridge during the
    // first paint can compete with WebView rendering and make the phone look
    // frozen. The four featured cards already provide useful Home content;
    // keep recommendations for the regular browser and load no network work
    // on the Android shell startup path.
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
    <main className="home-screen relative min-h-screen bg-[#0b0813] text-white px-4 pt-5 pb-24 sm:px-6 md:pb-12 max-w-[1240px] mx-auto overflow-hidden">
      {/* ── Background Ambient Lighting & Wave Line Graphics ── */}
      <div className="home-glow absolute top-0 right-0 size-[380px] rounded-full bg-purple-600/15 blur-[120px] pointer-events-none" />
      <div className="home-glow absolute top-1/3 left-0 size-[320px] rounded-full bg-fuchsia-600/10 blur-[130px] pointer-events-none" />

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
        {/* User Profile Avatar with vibrant gradient ring */}
        <button
          type="button"
          onClick={() => {
            setInputName(userName || 'Ibrahim')
            setIsNameModalOpen(true)
          }}
          aria-label="User Profile"
          className="group relative block text-left"
        >
          <div className="size-12 rounded-full p-[2px] bg-gradient-to-tr from-blue-500 via-purple-500 to-pink-500 shadow-md shadow-purple-500/20 transition-transform duration-300 group-hover:scale-105">
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
            className="home-backdrop flex size-11 items-center justify-center rounded-full bg-[#1e182e]/80 border border-white/10 text-white/80 transition-all duration-300 hover:bg-white/10 hover:text-white hover:scale-105 active:scale-95 backdrop-blur-xl"
          >
            <Search className="size-5" />
          </Link>

          {/* Downloads / Notifications Button */}
          <button
            type="button"
            onClick={() => setPanelOpen(!panelOpen)}
            aria-label="Downloads panel"
            className="home-backdrop relative flex size-11 items-center justify-center rounded-full bg-[#1e182e]/80 border border-white/10 text-white/80 transition-all duration-300 hover:bg-white/10 hover:text-white hover:scale-105 active:scale-95 backdrop-blur-xl"
          >
            <Bell className="size-5" />
            {activeCount > 0 && (
              <span className="absolute top-2 right-2 size-2.5 rounded-full bg-[#c026d3] ring-2 ring-[#0b0813] animate-pulse" />
            )}
          </button>
        </div>
      </header>

      {/* ── Greeting Title ── */}
      <div className="relative z-10 mt-5 mb-5 flex items-center gap-3">
        <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
          Hello, {userName || 'Ibrahim'}
        </h1>
        <button
          type="button"
          onClick={() => {
            setInputName(userName || 'Ibrahim')
            setIsNameModalOpen(true)
          }}
          aria-label="Edit Name"
          className="rounded-full p-1.5 text-white/40 hover:bg-white/10 hover:text-white transition-all"
        >
          <Pencil className="size-4" />
        </button>
      </div>

      {/* ── First-Time User Name Setup Modal ── */}
      {isNameModalOpen && (
        <div className="home-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md px-4 animate-in fade-in duration-300">
          <div className="w-full max-w-md rounded-3xl border border-white/15 bg-[#161124] p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-2xl bg-[#c026d3]/20 border border-[#c026d3]/30 text-[#c026d3]">
                  <User className="size-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Welcome to My UTube</h2>
                  <p className="text-xs text-[#a3a3a3]">Enter your name to customize your app</p>
                </div>
              </div>
              {userName && (
                <button
                  type="button"
                  onClick={() => setIsNameModalOpen(false)}
                  className="rounded-full p-1.5 text-white/60 hover:bg-white/10 hover:text-white"
                >
                  <X className="size-5" />
                </button>
              )}
            </div>

            <form onSubmit={handleSaveName} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#a3a3a3] mb-1.5">Your Name</label>
                <input
                  type="text"
                  value={inputName}
                  onChange={(e) => setInputName(e.target.value)}
                  placeholder="e.g. Ibrahim"
                  autoFocus
                  className="w-full rounded-2xl border border-white/15 bg-[#1e182e] px-4 py-3.5 text-sm font-medium text-white placeholder:text-white/30 focus:border-[#c026d3] focus:outline-none focus:ring-2 focus:ring-[#c026d3]/30 transition-all"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full rounded-2xl bg-[#c026d3] py-3.5 text-sm font-bold text-white shadow-lg shadow-fuchsia-500/30 hover:bg-[#a21caf] transition-all active:scale-95"
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
        <div className="home-backdrop relative z-10 mb-6 rounded-2xl border border-white/10 bg-[#161124]/90 p-4 text-center backdrop-blur-xl">
          <p className="text-sm font-semibold text-white">You&apos;re offline</p>
          <p className="mt-1 text-xs text-[#a3a3a3]">
            Downloaded music and videos remain available in your Library.
          </p>
        </div>
      )}

      {/* ── Main Asymmetric Bento Card Grid ── */}
      {filter !== 'downloaded' && (
        <section className="relative z-10 mb-10">
          <div className="grid grid-cols-2 gap-3.5 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
            {/* 1. A$AP Rocky Card (Tall Left) */}
            <Link
              href="/watch/Kbj2Zmg1776"
              className="home-card group relative block overflow-hidden rounded-3xl border border-white/10 bg-[#171226] transition-all duration-500 hover:scale-[1.02] hover:shadow-2xl hover:shadow-purple-500/20 aspect-[3/4]"
            >
              <img
                src="/images/home/asap_rocky.png"
                alt="A$AP Rocky"
                className="home-card-image size-full object-cover transition-transform duration-700 group-hover:scale-110"
                loading="lazy"
                decoding="async"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0b0813] via-[#0b0813]/30 to-transparent" />
              {/* Badge */}
              <div className="absolute top-3 left-3 rounded-full bg-black/40 border border-white/15 px-3 py-1 text-[11px] font-medium text-white backdrop-blur-md flex items-center gap-1.5 shadow-md">
                <Flame className="size-3.5 text-orange-400 fill-orange-400" />
                In Charts
              </div>
              {/* Download Button */}
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  download.begin({
                    id: 'Kbj2Zmg1776',
                    title: 'A$AP Rocky - Praise The Lord (Da Shine) ft. Skepta',
                    channel: 'A$AP Rocky',
                    duration: '3:25',
                    thumbnail: '/images/home/asap_rocky.png',
                    sourceUrl: 'https://www.youtube.com/watch?v=Kbj2Zmg1776',
                  })
                }}
                aria-label="Download A$AP Rocky"
                className="absolute top-3 right-3 z-20 flex size-9 items-center justify-center rounded-full bg-black/50 border border-white/20 text-white/80 backdrop-blur-md transition-all hover:bg-[#c026d3] hover:text-white hover:border-[#c026d3] hover:scale-110 active:scale-95 shadow-lg"
              >
                <Download className="size-4" />
              </button>
              {/* Play Overlay Button */}
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
                <div className="flex size-12 items-center justify-center rounded-full bg-[#c026d3] text-white shadow-xl shadow-fuchsia-500/50 scale-90 group-hover:scale-100 transition-transform duration-300">
                  <Play className="size-6 fill-white ml-0.5" />
                </div>
              </div>
              {/* Card Footer Text */}
              <div className="absolute bottom-4 left-4 right-4">
                <h2 className="text-lg font-bold text-white tracking-tight group-hover:text-fuchsia-300 transition-colors">
                  A$AP Rocky
                </h2>
                <p className="text-xs text-[#a3a3a3]">132 songs</p>
              </div>
            </Link>

            {/* 2. Kendrick Lamar Card (Top Right) */}
            <Link
              href="/watch/H58vbez_m4E"
              className="home-card group relative block overflow-hidden rounded-3xl border border-white/10 bg-[#171226] transition-all duration-500 hover:scale-[1.02] hover:shadow-2xl hover:shadow-purple-500/20 aspect-square sm:aspect-[4/3]"
            >
              <img
                src="/images/home/kendrick_lamar.png"
                alt="Kendrick Lamar"
                className="home-card-image size-full object-cover transition-transform duration-700 group-hover:scale-110"
                loading="lazy"
                decoding="async"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0b0813] via-[#0b0813]/30 to-transparent" />
              {/* Download Button */}
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  download.begin({
                    id: 'H58vbez_m4E',
                    title: 'Kendrick Lamar - Not Like Us',
                    channel: 'Kendrick Lamar',
                    duration: '4:34',
                    thumbnail: '/images/home/kendrick_lamar.png',
                    sourceUrl: 'https://www.youtube.com/watch?v=H58vbez_m4E',
                  })
                }}
                aria-label="Download Kendrick Lamar"
                className="absolute top-3 right-3 z-20 flex size-9 items-center justify-center rounded-full bg-black/50 border border-white/20 text-white/80 backdrop-blur-md transition-all hover:bg-[#c026d3] hover:text-white hover:border-[#c026d3] hover:scale-110 active:scale-95 shadow-lg"
              >
                <Download className="size-4" />
              </button>
              {/* Play Overlay Button */}
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
                <div className="flex size-12 items-center justify-center rounded-full bg-[#c026d3] text-white shadow-xl shadow-fuchsia-500/50 scale-90 group-hover:scale-100 transition-transform duration-300">
                  <Play className="size-6 fill-white ml-0.5" />
                </div>
              </div>
              {/* Card Footer Text */}
              <div className="absolute bottom-4 left-4 right-4">
                <h2 className="text-base font-bold text-white tracking-tight group-hover:text-fuchsia-300 transition-colors sm:text-lg">
                  Kendrick Lamar
                </h2>
                <p className="text-xs text-[#a3a3a3]">98 songs</p>
              </div>
            </Link>

            {/* 3. Linkin Park Card (Middle Right) */}
            <Link
              href="/watch/eVTXPUF4Oz4"
              className="home-card group relative block overflow-hidden rounded-3xl border border-white/10 bg-[#171226] transition-all duration-500 hover:scale-[1.02] hover:shadow-2xl hover:shadow-purple-500/20 aspect-square sm:aspect-[4/3]"
            >
              <img
                src="/images/home/linkin_park.png"
                alt="Linkin Park"
                className="home-card-image size-full object-cover transition-transform duration-700 group-hover:scale-110"
                loading="lazy"
                decoding="async"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0b0813] via-[#0b0813]/30 to-transparent" />
              {/* Badge */}
              <div className="absolute top-3 left-3 rounded-full bg-black/40 border border-white/15 px-3 py-1 text-[11px] font-medium text-white backdrop-blur-md flex items-center gap-1.5 shadow-md">
                <Sparkles className="size-3.5 text-amber-300 fill-amber-300" />
                Gold Record
              </div>
              {/* Download Button */}
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  download.begin({
                    id: 'eVTXPUF4Oz4',
                    title: 'Linkin Park - In The End (Official HD Video)',
                    channel: 'Linkin Park',
                    duration: '3:36',
                    thumbnail: '/images/home/linkin_park.png',
                    sourceUrl: 'https://www.youtube.com/watch?v=eVTXPUF4Oz4',
                  })
                }}
                aria-label="Download Linkin Park"
                className="absolute top-3 right-3 z-20 flex size-9 items-center justify-center rounded-full bg-black/50 border border-white/20 text-white/80 backdrop-blur-md transition-all hover:bg-[#c026d3] hover:text-white hover:border-[#c026d3] hover:scale-110 active:scale-95 shadow-lg"
              >
                <Download className="size-4" />
              </button>
              {/* Play Overlay Button */}
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
                <div className="flex size-12 items-center justify-center rounded-full bg-[#c026d3] text-white shadow-xl shadow-fuchsia-500/50 scale-90 group-hover:scale-100 transition-transform duration-300">
                  <Play className="size-6 fill-white ml-0.5" />
                </div>
              </div>
              {/* Card Footer Text */}
              <div className="absolute bottom-4 left-4 right-4">
                <h2 className="text-base font-bold text-white tracking-tight group-hover:text-fuchsia-300 transition-colors sm:text-lg">
                  Linkin Park
                </h2>
                <p className="text-xs text-[#a3a3a3]">72 songs</p>
              </div>
            </Link>

            {/* 4. Taylor Swift Card (Middle Left) */}
            <Link
              href="/watch/ic8j13U_FS8"
              className="home-card group relative block overflow-hidden rounded-3xl border border-white/10 bg-[#171226] transition-all duration-500 hover:scale-[1.02] hover:shadow-2xl hover:shadow-purple-500/20 aspect-[3/4]"
            >
              <img
                src="/images/home/taylor_swift.png"
                alt="Taylor Swift"
                className="home-card-image size-full object-cover transition-transform duration-700 group-hover:scale-110"
                loading="lazy"
                decoding="async"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0b0813] via-[#0b0813]/30 to-transparent" />
              {/* Download Button */}
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  download.begin({
                    id: 'ic8j13U_FS8',
                    title: 'Taylor Swift - Cruel Summer (Official Audio)',
                    channel: 'Taylor Swift',
                    duration: '2:58',
                    thumbnail: '/images/home/taylor_swift.png',
                    sourceUrl: 'https://www.youtube.com/watch?v=ic8j13U_FS8',
                  })
                }}
                aria-label="Download Taylor Swift"
                className="absolute top-3 right-3 z-20 flex size-9 items-center justify-center rounded-full bg-black/50 border border-white/20 text-white/80 backdrop-blur-md transition-all hover:bg-[#c026d3] hover:text-white hover:border-[#c026d3] hover:scale-110 active:scale-95 shadow-lg"
              >
                <Download className="size-4" />
              </button>
              {/* Play Overlay Button */}
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
                <div className="flex size-12 items-center justify-center rounded-full bg-[#c026d3] text-white shadow-xl shadow-fuchsia-500/50 scale-90 group-hover:scale-100 transition-transform duration-300">
                  <Play className="size-6 fill-white ml-0.5" />
                </div>
              </div>
              {/* Card Footer Text */}
              <div className="absolute bottom-4 left-4 right-4">
                <h2 className="text-lg font-bold text-white tracking-tight group-hover:text-fuchsia-300 transition-colors">
                  Taylor Swift
                </h2>
                <p className="text-xs text-[#a3a3a3]">48 songs</p>
              </div>
            </Link>

            {/* Dynamic Search/Recommendation Videos */}
            {recommendations.slice(0, 4).map(video => (
              <Link
                key={video.id}
                href={`/watch/${encodeURIComponent(video.id)}`}
                className="home-card group relative block overflow-hidden rounded-3xl border border-white/10 bg-[#171226] transition-all duration-500 hover:scale-[1.02] hover:shadow-2xl hover:shadow-purple-500/20 aspect-[4/3]"
              >
                <img
                  src={video.thumbnail || '/placeholder.svg'}
                  alt={video.title}
                  className="home-card-image size-full object-cover transition-transform duration-700 group-hover:scale-110"
                  loading="lazy"
                  decoding="async"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0b0813] via-[#0b0813]/40 to-transparent" />
                {/* Download Button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    download.begin(video)
                  }}
                  aria-label={`Download ${video.title}`}
                  className="absolute top-3 right-3 z-20 flex size-9 items-center justify-center rounded-full bg-black/50 border border-white/20 text-white/80 backdrop-blur-md transition-all hover:bg-[#c026d3] hover:text-white hover:border-[#c026d3] hover:scale-110 active:scale-95 shadow-lg"
                >
                  <Download className="size-4" />
                </button>
                {/* Play Overlay Button */}
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
                  <div className="flex size-12 items-center justify-center rounded-full bg-[#c026d3] text-white shadow-xl shadow-fuchsia-500/50 scale-90 group-hover:scale-100 transition-transform duration-300">
                    <Play className="size-6 fill-white ml-0.5" />
                  </div>
                </div>
                <div className="absolute bottom-4 left-4 right-4">
                  <h3 className="line-clamp-1 text-base font-bold text-white group-hover:text-fuchsia-300 transition-colors">
                    {video.title}
                  </h3>
                  <p className="text-xs text-[#a3a3a3]">{video.channel || 'YouTube'}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── Downloaded Media Section ── */}
      {(filter === 'downloaded' || completed.length > 0) && (
        <section className="relative z-10 mt-8 mb-8">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              <CheckCircle2 className="size-5 text-[#c026d3]" />
              Downloaded
            </h2>
            <Link href="/library" className="text-xs font-semibold text-[#c026d3] hover:underline">
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
                    className="home-card group relative block overflow-hidden rounded-3xl border border-white/10 bg-[#171226] transition-all duration-500 hover:scale-[1.02] hover:shadow-2xl hover:shadow-purple-500/20 aspect-[4/3]"
                  >
                    <img
                      src={item.thumbnail || '/placeholder.svg'}
                      alt={item.title}
                      className="home-card-image size-full object-cover transition-transform duration-700 group-hover:scale-110"
                      loading="lazy"
                      decoding="async"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0b0813] via-[#0b0813]/40 to-transparent" />
                    <span className="absolute top-3 right-3 rounded-full bg-black/60 border border-white/15 px-2.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur-md">
                      {isAudio(item) ? 'Audio' : 'Video'}
                    </span>
                    <div className="absolute bottom-4 left-4 right-4">
                      <h3 className="line-clamp-1 text-sm font-bold text-white group-hover:text-fuchsia-300 transition-colors">
                        {item.title}
                      </h3>
                      <p className="text-xs text-[#a3a3a3]">Downloaded offline</p>
                    </div>
                  </Link>
                )
              })}
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-white/10 bg-[#140f21]/80 p-8 text-center backdrop-blur-xl">
              <Music2 className="mx-auto size-8 text-[#a3a3a3]/50 mb-2" />
              <p className="text-sm font-semibold text-white">No downloaded media yet</p>
              <p className="mt-1 text-xs text-[#a3a3a3]">
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
