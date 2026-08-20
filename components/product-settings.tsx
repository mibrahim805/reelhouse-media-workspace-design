'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, ChevronRight, Download, HardDrive, Heart,
  Check, Info, ListMusic, Music2, Palette, Play, Shield,
  Trash2, UserRound, Video, X
} from 'lucide-react'
import { useDownloads, type DownloadItem } from '@/components/download-store'
import { useLibrary } from '@/components/library-store'
import { useTheme, type ThemePreference } from '@/components/theme-provider'

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto w-full max-w-3xl px-4 pb-28 pt-5 sm:px-5">{children}</main>
}

function Head({ title, subtitle, back = false }: { title: string; subtitle?: string; back?: boolean }) {
  const router = useRouter()
  return (
    <header className="mb-6 flex items-center gap-3">
      {back && (
        <button
          onClick={() => router.back()}
          className="flex size-9 shrink-0 items-center justify-center rounded-full border border-[#292929] bg-[#151515] text-[#a3a3a3] hover:text-white"
        >
          <ArrowLeft className="size-4" />
        </button>
      )}
      <div>
        <h1 className="text-[24px] font-bold text-white">{title}</h1>
        {subtitle && <p className="mt-0.5 text-[13px] text-[#a3a3a3]">{subtitle}</p>}
      </div>
    </header>
  )
}

/* ── 26 Profile ── */
export function ProfileHub() {
  const { downloads, completedCount } = useDownloads()
  const video = downloads.filter(d => d.status === 'completed' && !/\.(mp3|m4a|aac|wav|ogg)$/i.test(d.filename || '')).length
  const music = completedCount - video
  const [themeOpen, setThemeOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const { theme, setTheme } = useTheme()

  return (
    <Shell>
      <Head title="Profile" subtitle="Local media and app settings" />
      {/* Avatar card */}
      <div className="flex items-center gap-4 rounded-3xl border border-[#292929] bg-[#151515] p-5">
        <span className="flex size-16 items-center justify-center rounded-full bg-primary/15 text-primary">
          <UserRound className="size-8" />
        </span>
        <div>
          <h2 className="text-lg font-bold text-white">Local Profile</h2>
          <p className="text-sm text-[#a3a3a3]">No account required</p>
        </div>
      </div>
      {/* Stats */}
      <div className="mt-4 grid grid-cols-3 gap-3">
        <StatCard label="Downloads" value={completedCount} />
        <StatCard label="Videos" value={video} />
        <StatCard label="Music" value={music} />
      </div>
      {/* Settings list */}
      <div className="mt-6 overflow-hidden rounded-2xl border border-[#292929] bg-[#151515]">
        <SettingRow href="/downloads/settings" icon={<Download />} label="Download Settings" />
        <SettingRow href="/library" icon={<Play />} label="Playback & Library" />
        <SettingRow href="/storage" icon={<HardDrive />} label="Storage" />
        <SettingRow onClick={() => setThemeOpen(true)} icon={<Palette />} label="Appearance" value={themeLabel(theme)} />
        <SettingRow href="/history" icon={<Shield />} label="Privacy & History" />
        <SettingRow onClick={() => setAboutOpen(true)} icon={<Info />} label="About" value="Reelhouse" />
      </div>

      {themeOpen && (
        <ProfileDialog title="Appearance" onClose={() => setThemeOpen(false)}>
          <p className="text-sm leading-6 text-[#a3a3a3]">Choose how Reelhouse should follow your display preference.</p>
          <div className="mt-4 space-y-2">
            {(['system', 'light', 'dark'] as ThemePreference[]).map(option => (
              <button
                key={option}
                type="button"
                onClick={() => setTheme(option)}
                className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition-colors ${theme === option ? 'border-primary/60 bg-primary/10' : 'border-[#292929] bg-[#1d1d1d] hover:border-primary/40'}`}
              >
                <span className={`flex size-9 items-center justify-center rounded-xl ${theme === option ? 'bg-primary text-white' : 'bg-[#292929] text-transparent'}`}>
                  <Check className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-white">{themeLabel(option)}</span>
                  <span className="mt-0.5 block text-xs text-[#a3a3a3]">{themeDescription(option)}</span>
                </span>
              </button>
            ))}
          </div>
        </ProfileDialog>
      )}

      {aboutOpen && (
        <ProfileDialog title="About Reelhouse" onClose={() => setAboutOpen(false)}>
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-primary text-white">
              <Play className="size-5 fill-current" />
            </span>
            <div>
              <p className="font-semibold text-white">Reelhouse</p>
              <p className="text-xs text-[#a3a3a3]">Your media, anywhere.</p>
            </div>
          </div>
          <p className="mt-4 text-sm leading-6 text-[#a3a3a3]">Search, watch, download, and manage your media in one place.</p>
        </ProfileDialog>
      )}
    </Shell>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-[#292929] bg-[#151515] p-4 text-center">
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="mt-0.5 text-[11px] text-[#a3a3a3]">{label}</p>
    </div>
  )
}

function themeLabel(theme: ThemePreference) {
  return theme === 'system' ? 'System default' : theme === 'light' ? 'Light' : 'Dark'
}

function themeDescription(theme: ThemePreference) {
  return theme === 'system'
    ? 'Follow your device appearance.'
    : theme === 'light'
      ? 'Use a bright Reelhouse workspace.'
      : 'Use the dark Reelhouse workspace.'
}

function SettingRow({ href, onClick, icon, label, value }: { href?: string; onClick?: () => void; icon: React.ReactNode; label: string; value?: string }) {
  const content = (
    <>
      <span className="text-[#a3a3a3] [&>svg]:size-4">{icon}</span>
      <span className="text-white">{label}</span>
      <span className="ml-auto flex items-center gap-1 text-xs text-[#a3a3a3]">
        {value}
        <ChevronRight className="size-4" />
      </span>
    </>
  )
  const className = "flex min-h-14 w-full items-center gap-3 border-b border-[#292929] px-4 text-left text-sm last:border-0 hover:bg-[#1d1d1d]"
  return onClick ? <button type="button" onClick={onClick} className={className}>{content}</button> : <Link href={href || '#'} className={className}>{content}</Link>
}

function ProfileDialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/75 p-4 sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="absolute inset-0" onClick={onClose} aria-label="Close dialog" />
      <section className="relative w-full max-w-md rounded-3xl border border-[#292929] bg-[#151515] p-5 shadow-2xl">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-white">{title}</h2>
          <button type="button" onClick={onClose} className="ml-auto flex size-9 items-center justify-center rounded-xl text-[#a3a3a3] hover:bg-[#1d1d1d] hover:text-white" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </section>
    </div>
  )
}

/* ── 27 Download Settings ── */
export function DownloadPreferences() {
  const { preferences, setPreferences } = useLibrary()
  const update = <K extends keyof typeof preferences>(key: K, value: (typeof preferences)[K]) =>
    setPreferences({ ...preferences, [key]: value })

  return (
    <Shell>
      <Head title="Download Settings" subtitle="Preferences stored in this browser" back />
      <Group title="Default quality">
        <SelectRow
          label="Video quality"
          value={preferences.defaultVideoQuality}
          onChange={v => update('defaultVideoQuality', v)}
          options={[['ask','Ask every time'],['best','Best available'],['1080','Up to 1080p'],['720','Up to 720p'],['480','Up to 480p']]}
        />
        <SelectRow
          label="Audio preference"
          value={preferences.defaultAudioQuality}
          onChange={v => update('defaultAudioQuality', v)}
          options={[['audio','Audio only'],['best','Best available']]}
        />
      </Group>
      <Group title="Behavior">
        <ToggleRow label="Remember previous quality" value={preferences.rememberQuality} onChange={v => update('rememberQuality', v)} />
        <ToggleRow label="Auto retry after interruption" value={preferences.autoRetry} onChange={v => update('autoRetry', v)} />
        <SelectRow
          label="Network preference"
          value={preferences.networkPreference}
          onChange={v => update('networkPreference', v as 'any' | 'wifi')}
          options={[['any','Any connection'],['wifi','Prefer Wi-Fi']]}
        />
      </Group>
      <Group title="Backend">
        <InfoRow label="Concurrent downloads" value="Managed by Django server" />
        <InfoRow label="Download destination" value="Django media storage" />
      </Group>
    </Shell>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 px-1 text-sm font-semibold text-[#a3a3a3] uppercase tracking-wide">{title}</h2>
      <div className="overflow-hidden rounded-2xl border border-[#292929] bg-[#151515]">{children}</div>
    </section>
  )
}

function SelectRow({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[][] }) {
  return (
    <label className="flex min-h-14 items-center border-b border-[#292929] px-4 last:border-0 hover:bg-[#1d1d1d]">
      <span className="text-sm text-white">{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="ml-auto max-w-[55%] rounded-lg border border-[#292929] bg-[#090909] px-2 py-2 text-xs text-white"
      >
        {options.map(o => <option key={o[0]} value={o[0]}>{o[1]}</option>)}
      </select>
    </label>
  )
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-14 items-center border-b border-[#292929] px-4 last:border-0 hover:bg-[#1d1d1d]">
      <span className="text-sm text-white">{label}</span>
      <input
        type="checkbox"
        checked={value}
        onChange={e => onChange(e.target.checked)}
        className="ml-auto size-5 accent-violet-500"
      />
    </label>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-14 items-center border-b border-[#292929] px-4 last:border-0">
      <span className="text-sm text-white">{label}</span>
      <span className="ml-auto text-right text-xs text-[#a3a3a3]">{value}</span>
    </div>
  )
}

/* ── 28 Storage Manager ── */
export function StorageManager() {
  const { downloads, removeDownload } = useDownloads()
  const { removeStaleIds } = useLibrary()
  const completed = downloads.filter(d => d.status === 'completed')
  const size = (d: DownloadItem) => { const n = parseFloat(d.size); return Number.isFinite(n) ? n : 0 }
  const total = completed.reduce((n, d) => n + size(d), 0)
  const audio = completed.filter(d => /\.(mp3|m4a|aac|wav|ogg)$/i.test(d.filename || ''))
  const audioSize = audio.reduce((n, d) => n + size(d), 0)
  const videoSize = total - audioSize
  const large = [...completed].sort((a, b) => size(b) - size(a)).slice(0, 5)

  return (
    <Shell>
      <Head title="Storage" subtitle="Downloaded media tracked in this browser" back />
      {/* Summary */}
      <div className="rounded-3xl border border-[#292929] bg-[#151515] p-6 text-center">
        <p className="text-5xl font-bold text-white">{total.toFixed(1)}</p>
        <p className="mt-1 text-sm text-[#a3a3a3]">MB across {completed.length} downloads</p>
        {/* Bar */}
        <div className="mx-auto mt-5 h-3 w-full max-w-xs overflow-hidden rounded-full bg-[#1d1d1d]">
          <div className="flex h-full">
            <div className="bg-primary" style={{ width: total ? `${(videoSize / total) * 100}%` : '0' }} />
            <div className="bg-white/30" style={{ width: total ? `${(audioSize / total) * 100}%` : '0' }} />
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-[#1d1d1d] p-3">
            <div className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-primary" />
              <span className="text-xs text-[#a3a3a3]">Video</span>
            </div>
            <p className="mt-1 text-lg font-bold text-white">{videoSize.toFixed(1)} MB</p>
          </div>
          <div className="rounded-xl bg-[#1d1d1d] p-3">
            <div className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-white/30" />
              <span className="text-xs text-[#a3a3a3]">Audio</span>
            </div>
            <p className="mt-1 text-lg font-bold text-white">{audioSize.toFixed(1)} MB</p>
          </div>
        </div>
      </div>

      {/* Largest downloads */}
      <section className="mt-7">
        <h2 className="mb-3 text-[17px] font-bold text-white">Largest downloads</h2>
        {large.length ? (
          <div className="space-y-2">
            {large.map(item => (
              <div key={item.id} className="flex items-center gap-3 rounded-2xl border border-[#292929] bg-[#151515] p-3">
                <span className="flex size-10 items-center justify-center rounded-xl bg-[#1d1d1d]">
                  {/\.(mp3|m4a)$/i.test(item.filename || '') ? <Music2 className="size-4 text-[#a3a3a3]" /> : <Video className="size-4 text-[#a3a3a3]" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">{item.title}</p>
                  <p className="text-xs text-[#a3a3a3]">{item.size}</p>
                </div>
                <button
                  onClick={() => removeDownload(item.id)}
                  className="flex size-8 items-center justify-center rounded-full text-[#a3a3a3] hover:bg-[#1d1d1d] hover:text-destructive"
                  aria-label="Remove"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-2xl border border-dashed border-[#292929] p-8 text-center text-sm text-[#a3a3a3]">
            No downloaded media yet.
          </p>
        )}
      </section>

      <button
        onClick={() => removeStaleIds(completed.map(d => d.id))}
        className="mt-6 w-full rounded-xl border border-[#292929] bg-[#151515] py-3 text-sm font-semibold text-white hover:bg-[#1d1d1d]"
      >
        Clear stale library references
      </button>
      <p className="mt-3 text-xs leading-5 text-[#a3a3a3]">
        Removing history does not delete backend files. Device capacity is not shown — browsers cannot reliably access it.
      </p>
    </Shell>
  )
}
