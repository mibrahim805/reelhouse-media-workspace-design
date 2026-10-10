import Link from 'next/link'
import { ArrowLeft, Zap } from 'lucide-react'

export default function ShortsPage() {
  return (
    <main className="min-h-screen bg-[#0b0813] px-5 pb-28 pt-8 text-white">
      <div className="mx-auto flex min-h-[70vh] w-full max-w-2xl flex-col items-center justify-center text-center">
        <span className="mb-5 flex size-16 items-center justify-center rounded-3xl bg-gradient-to-br from-[#ff5368] to-[#a855f7] shadow-[0_12px_32px_rgba(236,72,153,0.35)]">
          <Zap className="size-8 fill-current" />
        </span>
        <h1 className="text-3xl font-bold tracking-tight">Shorts</h1>
        <p className="mt-3 max-w-sm text-sm leading-6 text-white/60">
          The Shorts experience is coming soon. This button is ready for the future Shorts feed.
        </p>
        <Link href="/" className="mt-7 flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/15">
          <ArrowLeft className="size-4" />
          Back home
        </Link>
      </div>
    </main>
  )
}
