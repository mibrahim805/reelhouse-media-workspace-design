// 'use client'

import { useEffect, useState } from 'react'
import { ArrowRight, Download, Link2, Play, Search } from 'lucide-react'
import type { MediaVideo } from '@/lib/backend-api'
import { cn } from '@/lib/utils'

const PIPELINE = [
  { icon: Search, label: 'Search', hint: 'Browse a live feed with instant filters' },
  { icon: Play, label: 'Watch', hint: 'Preview instantly, no redirects' },
  { icon: Download, label: 'Download', hint: 'Pick a quality, save it locally' },
] as const

const SOURCES = [
  'youtube.com/watch',
  'instagram.com/reel',
  'tiktok.com/@user',
  'facebook.com/video',
]

const FLOAT_POSITIONS = [
  'left-2 top-2 -rotate-6',
  'right-0 top-14 rotate-3',
  'left-10 bottom-4 rotate-2',
  'right-10 bottom-0 -rotate-3',
]

export function HeroSection({
  trending,
  feedLoading,
  feedError,
  onOpenWorkspace,
  onPasteLink,
  onOpenVideo,
}: {
  trending: MediaVideo[]
  feedLoading: boolean
  feedError: boolean
  onOpenWorkspace: () => void
  onPasteLink: () => void
  onOpenVideo: (video: MediaVideo) => void
}) {
  const [activeStep, setActiveStep] = useState(0)
  const [sourceIndex, setSourceIndex] = useState(0)

  useEffect(() => {
    const id = setInterval(
      () => setActiveStep((s) => (s + 1) % PIPELINE.length),
      1700,
    )
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const id = setInterval(
      () => setSourceIndex((s) => (s + 1) % SOURCES.length),
      2300,
    )
    return () => clearInterval(id)
  }, [])

  const floaters = Array.from({ length: 4 }).map((_, i) => trending[i])
  const feedStatus = feedLoading
    ? 'Loading backend'
    : feedError
      ? 'Backend unavailable'
      : trending.length > 0
        ? 'Backend live'
        : 'Open workspace'

  return (
    <section className="relative overflow-hidden rounded-3xl border border-border bg-card">
      {/* Ambient glow */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-20 -top-24 size-72 rounded-full bg-primary/25 blur-3xl [animation:blob-pulse_7s_ease-in-out_infinite]" />
        <div className="absolute -right-16 top-8 size-64 rounded-full bg-success/15 blur-3xl [animation:blob-pulse_9s_ease-in-out_infinite_1s]" />
      </div>

      <div className="relative grid gap-10 px-5 py-10 sm:px-8 sm:py-14 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:px-12">
        {/* Copy */}
        <div>
          <span
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/60 px-2.5 py-1 text-xs font-medium text-muted-foreground opacity-0 [animation:fade-up_0.6s_ease_forwards]"
          >
            <span
              className={cn(
                'size-1.5 rounded-full',
                feedError ? 'bg-destructive' : 'bg-success',
              )}
            />
            {feedStatus}
          </span>

          <h1 className="mt-4 text-balance text-4xl font-semibold leading-[1.05] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            {['Find it.', 'Watch it.', 'Keep it.'].map((line, i) => (
              <span
                key={line}
                className="block opacity-0 [animation:fade-up_0.6s_ease_forwards]"
                style={{ animationDelay: `${0.15 + i * 0.12}s` }}
              >
                {line}
              </span>
            ))}
          </h1>

          <p
            className="mt-4 max-w-md text-pretty text-sm leading-relaxed text-muted-foreground opacity-0 [animation:fade-up_0.6s_ease_forwards] sm:text-base"
            style={{ animationDelay: '0.55s' }}
          >
            One dark, fast workspace for YouTube, Instagram, TikTok, and
            Facebook. Browse a feed, preview instantly, and download in the
            quality you want — no redirects, no clutter.
          </p>

          <div
            className="mt-6 flex flex-wrap items-center gap-3 opacity-0 [animation:fade-up_0.6s_ease_forwards]"
            style={{ animationDelay: '0.7s' }}
          >
            <button
              onClick={onOpenWorkspace}
              className="group flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Open YouTube Workspace
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </button>
            <button
              onClick={onPasteLink}
              className="flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
            >
              <Link2 className="size-4" />
              Paste a link
            </button>
          </div>

          {/* Pipeline signature: the product's actual flow, animated */}
          <div
            className="relative mt-10 max-w-md opacity-0 [animation:fade-up_0.6s_ease_forwards]"
            style={{ animationDelay: '0.85s' }}
          >
            <div className="relative flex items-start justify-between">
              <div className="absolute left-[calc(100%/6)] right-[calc(100%/6)] top-5 h-px bg-border">
                <div
                  className="h-px bg-primary transition-all duration-700 ease-out"
                  style={{
                    width: `${(activeStep / (PIPELINE.length - 1)) * 100}%`,
                  }}
                />
              </div>
              {PIPELINE.map((step, i) => {
                const Icon = step.icon
                const active = i === activeStep
                return (
                  <div
                    key={step.label}
                    className="relative flex flex-1 flex-col items-center text-center"
                  >
                    <span
                      className={cn(
                        'flex size-10 items-center justify-center rounded-full border bg-background transition-all duration-500',
                        active
                          ? 'scale-110 border-primary text-primary ring-4 ring-primary/15'
                          : 'border-border text-muted-foreground',
                      )}
                    >
                      <Icon className="size-4" />
                    </span>
                    <span
                      className={cn(
                        'mt-2 text-[11px] font-medium transition-colors',
                        active ? 'text-foreground' : 'text-muted-foreground',
                      )}
                    >
                      {step.label}
                    </span>
                  </div>
                )
              })}
            </div>
            <p className="mt-3 min-h-[1.2em] text-center text-[11px] text-muted-foreground">
              {PIPELINE[activeStep].hint}
            </p>
          </div>
        </div>

        {/* Visual */}
        <div className="relative hidden h-[300px] items-center justify-center lg:flex">
          <div
            aria-hidden
            className="absolute size-56 rounded-full border border-dashed border-border/70 [animation:spin-slow_20s_linear_infinite]"
          />
          <div
            aria-hidden
            className="absolute size-40 rounded-full border border-border/50"
          />

          {floaters.map((v, i) =>
            v ? (
              <button
                type="button"
                key={v.id || v.sourceUrl || i}
                onClick={() => onOpenVideo(v)}
                className={cn(
                  'absolute w-28 overflow-hidden rounded-xl border border-border bg-background text-left shadow-lg transition-transform hover:scale-105',
                  FLOAT_POSITIONS[i],
                )}
                style={{
                  animation: `float-slow ${5 + i}s ease-in-out infinite`,
                  animationDelay: `${i * 0.35}s`,
                }}
              >
                <img
                  src={v.thumbnail || '/placeholder.svg'}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="h-16 w-full object-cover"
                />
              </button>
            ) : (
              <div
                key={i}
                className={cn(
                  'absolute flex h-16 w-28 items-center justify-center overflow-hidden rounded-xl border border-border bg-background',
                  FLOAT_POSITIONS[i],
                )}
                style={{
                  animation: `float-slow ${5 + i}s ease-in-out infinite`,
                  animationDelay: `${i * 0.35}s`,
                }}
              >
                {feedLoading ? (
                  <div className="h-full w-full animate-pulse bg-muted" />
                ) : (
                  <Play className="size-4 text-muted-foreground" />
                )}
              </div>
            ),
          )}

          <div className="relative z-10 flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-xs font-medium text-foreground shadow-lg">
            <Link2 className="size-3.5 text-primary" />
            <span
              key={sourceIndex}
              className="inline-block min-w-32 opacity-0 [animation:fade-up_0.4s_ease_forwards]"
            >
              {SOURCES[sourceIndex]}
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}
