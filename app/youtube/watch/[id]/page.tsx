export function generateStaticParams() { return [{ id: 'placeholder' }] }

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { WatchView } from '@/components/youtube/watch-view'
import { getVideoById } from '@/lib/mock-data'

export default async function WatchPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const video = getVideoById(id)

  if (!video) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-3 px-4 py-24 text-center">
        <p className="text-lg font-semibold text-foreground">Video not found</p>
        <p className="text-sm text-muted-foreground">
          This video is no longer available.
        </p>
        <Link
          href="/youtube"
          className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
        >
          <ArrowLeft className="size-4" /> Back to workspace
        </Link>
      </div>
    )
  }

  return <WatchView video={video} />
}
