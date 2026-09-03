'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Bell, Check, Download, HardDrive, Library, Play, ShieldCheck } from 'lucide-react'

function Logo() {
  return (
    <span className="flex size-16 items-center justify-center rounded-[22px] bg-primary shadow-2xl shadow-primary/40">
      <Play className="size-8 fill-white text-white" />
    </span>
  )
}

function Dots({ active }: { active: number }) {
  return (
    <div className="flex justify-center gap-2">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className={`h-1.5 rounded-full transition-all duration-300 ${i === active ? 'w-6 bg-primary' : 'w-1.5 bg-[#292929]'}`}
        />
      ))}
    </div>
  )
}

function Entry({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col bg-[#090909] px-6 pb-10 pt-12">
      {children}
    </main>
  )
}

function HeroIllustration({ kind }: { kind: 'media' | 'download' | 'offline' }) {
  return (
    <div className="relative mx-auto mt-8 flex h-64 w-full items-center justify-center overflow-hidden rounded-[28px] border border-[#292929] bg-[#111]">
      <div className="absolute size-56 rounded-full bg-primary/10 blur-3xl" />
      {kind === 'media' && (
        <div className="relative grid grid-cols-2 gap-3 -rotate-3">
          <span className="flex h-28 w-36 items-center justify-center rounded-2xl border border-[#292929] bg-[#151515]">
            <Play className="size-10 text-primary" />
          </span>
          <span className="mt-8 flex h-28 w-28 items-center justify-center rounded-2xl border border-[#292929] bg-[#151515]">
            <Library className="size-8 text-[#a3a3a3]" />
          </span>
        </div>
      )}
      {kind === 'download' && (
        <div className="relative w-[82%] rounded-2xl border border-[#292929] bg-[#151515] p-4">
          <div className="flex items-center gap-3">
            <span className="flex size-12 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <Download className="size-6" />
            </span>
            <div>
              <p className="text-sm font-semibold text-white">Saving your media</p>
              <p className="text-xs text-[#a3a3a3]">720p · MP4</p>
            </div>
            <span className="ml-auto text-sm font-bold text-primary">68%</span>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#1d1d1d]">
            <div className="h-full w-[68%] rounded-full bg-primary" />
          </div>
          <p className="mt-2 text-right text-[11px] text-[#a3a3a3]">3.2 MB/s · 14s remaining</p>
        </div>
      )}
      {kind === 'offline' && (
        <div className="relative grid grid-cols-2 gap-3">
          {[Play, Library, Download, Check].map((Icon, i) => (
            <span
              key={i}
              className={`flex size-24 items-center justify-center rounded-2xl border border-[#292929] bg-[#151515] ${i === 3 ? 'text-primary' : 'text-[#a3a3a3]'}`}
            >
              <Icon className="size-8" />
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── 01 Splash ── */
export function Splash() {
  return (
    <Entry>
      <div className="flex flex-1 flex-col items-center justify-center">
        <Logo />
        <h1 className="mt-6 text-3xl font-bold tracking-tight text-white">My UTube</h1>
        <p className="mt-2 text-sm text-[#a3a3a3]">Watch. Save. Enjoy.</p>
        <span
          className="mt-10 size-6 animate-spin rounded-full border-2 border-[#292929] border-t-primary"
          aria-label="Loading"
        />
      </div>
      <Link href="/onboarding/welcome" className="text-center text-xs text-[#a3a3a3] hover:text-white">
        Continue
      </Link>
    </Entry>
  )
}

/* ── 02 Onboarding Welcome ── */
export function Welcome() {
  return (
    <Entry>
      <div className="flex items-center justify-between">
        <Logo />
        <Link href="/" className="rounded-xl px-3 py-2 text-sm font-medium text-[#a3a3a3] hover:text-white">
          Skip
        </Link>
      </div>
      <HeroIllustration kind="media" />
      <div className="mt-auto">
        <Dots active={0} />
        <h1 className="mt-6 text-[34px] font-bold leading-tight tracking-tight text-white">
          Your media.<br />Anywhere.
        </h1>
        <p className="mt-3 text-[15px] leading-7 text-[#a3a3a3]">
          Download supported content, discover online, and enjoy your personal collection offline.
        </p>
        <Link
          href="/onboarding/downloads"
          className="mt-8 flex h-14 w-full items-center justify-center rounded-2xl bg-primary text-[15px] font-bold text-white"
        >
          Get Started
        </Link>
      </div>
    </Entry>
  )
}

/* ── 03 Onboarding Fast Downloads ── */
export function FastDownloads() {
  return (
    <Entry>
      <HeroIllustration kind="download" />
      <div className="mt-auto">
        <Dots active={1} />
        <h1 className="mt-6 text-[34px] font-bold tracking-tight text-white">Fast Downloads</h1>
        <p className="mt-3 text-[15px] leading-7 text-[#a3a3a3]">
          Choose real available formats, monitor genuine speed and ETA, and keep downloads running in the backend.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          {['Real qualities', 'Backend speed', 'Cancel & retry'].map(x => (
            <span key={x} className="rounded-full border border-[#292929] bg-[#151515] px-4 py-2 text-[13px] font-medium text-[#a3a3a3]">
              {x}
            </span>
          ))}
        </div>
        <Link
          href="/onboarding/offline"
          className="mt-8 flex h-14 w-full items-center justify-center rounded-2xl bg-primary text-[15px] font-bold text-white"
        >
          Continue
        </Link>
      </div>
    </Entry>
  )
}

/* ── 04 Onboarding Offline ── */
export function OfflineMedia() {
  return (
    <Entry>
      <HeroIllustration kind="offline" />
      <div className="mt-auto">
        <Dots active={2} />
        <h1 className="mt-6 text-[34px] font-bold tracking-tight text-white">Enjoy Anywhere</h1>
        <p className="mt-3 text-[15px] leading-7 text-[#a3a3a3]">
          Play completed video and audio files from your library, organize favorites, and create playlists.
        </p>
        <Link
          href="/permissions"
          className="mt-8 flex h-14 w-full items-center justify-center rounded-2xl bg-primary text-[15px] font-bold text-white"
        >
          Continue
        </Link>
      </div>
    </Entry>
  )
}

/* ── 05 Permissions ── */
export function Permissions() {
  const router = useRouter()
  const request = async () => {
    if ('Notification' in window && Notification.permission === 'default')
      await Notification.requestPermission()
    if (navigator.storage?.persist) await navigator.storage.persist()
    localStorage.setItem('reelhouse.onboarding-complete', 'true')
    router.push('/')
  }
  return (
    <Entry>
      <div>
        <h1 className="text-[34px] font-bold tracking-tight text-white">Browser capabilities</h1>
        <p className="mt-2 text-[15px] leading-6 text-[#a3a3a3]">
          Enable only capabilities this web app can genuinely request.
        </p>
      </div>
      <div className="mt-8 space-y-3">
        <Capability icon={<Bell className="size-5" />} title="Notifications" text="Receive completion alerts when browser notification permission is available." />
        <Capability icon={<HardDrive className="size-5" />} title="Persistent storage" text="Ask the browser to preserve playlists, history, and preferences." />
        <Capability icon={<ShieldCheck className="size-5" />} title="Background activity" text="Downloads run on the Django server — browser background execution is not guaranteed." />
      </div>
      <div className="mt-auto grid gap-3 pt-6">
        <button
          onClick={request}
          className="flex h-14 w-full items-center justify-center rounded-2xl bg-primary text-[15px] font-bold text-white"
        >
          Allow available capabilities
        </button>
        <button
          onClick={() => { localStorage.setItem('reelhouse.onboarding-complete', 'true'); router.push('/') }}
          className="flex h-14 w-full items-center justify-center rounded-2xl border border-[#292929] bg-[#151515] text-[15px] font-semibold text-white"
        >
          Not now
        </button>
      </div>
    </Entry>
  )
}

function Capability({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <section className="flex gap-4 rounded-2xl border border-[#292929] bg-[#151515] p-4">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
        {icon}
      </span>
      <div>
        <h2 className="font-semibold text-white">{title}</h2>
        <p className="mt-1 text-[13px] leading-5 text-[#a3a3a3]">{text}</p>
      </div>
    </section>
  )
}
