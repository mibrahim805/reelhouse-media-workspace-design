'use client'

import { useState } from 'react'
import { Download, Play, Trash2 } from 'lucide-react'
import { useDownloads, type DownloadItem } from '@/components/download-store'

export function MyFilesView() {
  const { downloads, removeDownload, saveDownload } = useDownloads()
  const [playing, setPlaying] = useState<DownloadItem | null>(null)
  const files = downloads.filter((item) => item.status === 'completed')

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 pb-28 sm:px-5">
      <div className="mb-5 flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Download className="size-5" /></span><div><h1 className="text-xl font-semibold text-foreground">My Files</h1><p className="text-sm text-muted-foreground">Your downloaded videos</p></div></div>
      {files.length === 0 ? <div className="rounded-2xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">No downloaded videos yet.</div> : <div className="space-y-3">{files.map((file) => <article key={file.id} className="flex gap-3 rounded-2xl border border-border bg-card p-3"><img src={file.thumbnail || '/placeholder.svg'} alt="" className="size-24 shrink-0 rounded-xl object-cover" /><div className="min-w-0 flex-1"><h2 className="line-clamp-2 text-sm font-medium text-foreground">{file.title}</h2><p className="mt-1 text-xs text-muted-foreground">{file.quality} · {file.size} · {file.source}</p><div className="mt-3 flex gap-2"><button onClick={() => setPlaying(file)} className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground"><Play className="size-3 fill-current" /> Play</button>{file.fileUrl && <button onClick={() => saveDownload(file.id)} className="rounded-lg border border-border px-2.5 py-1.5 text-xs text-foreground">Save</button>}<button onClick={() => removeDownload(file.id)} aria-label="Remove video" className="rounded-lg border border-border px-2.5 py-1.5 text-muted-foreground"><Trash2 className="size-3.5" /></button></div></div></article>)}</div>}
      {playing && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4" onClick={() => setPlaying(null)}><div className="w-full max-w-3xl overflow-hidden rounded-2xl bg-card" onClick={(event) => event.stopPropagation()}><div className="flex items-center justify-between p-3"><p className="truncate text-sm font-medium text-foreground">{playing.title}</p><button onClick={() => setPlaying(null)} className="text-sm text-muted-foreground">Close</button></div><div className="aspect-video bg-black">{playing.fileUrl ? <video src={playing.fileUrl} poster={playing.thumbnail} controls autoPlay className="size-full" /> : <div className="flex h-full items-center justify-center p-6 text-center text-sm text-white">The video file is not available in this session.</div>}</div></div></div>}
    </div>
  )
}
