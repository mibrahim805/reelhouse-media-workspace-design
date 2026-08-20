import { Suspense } from 'react'
import { DownloaderView } from '@/components/screens/downloader/downloader-screen'

export default function DownloaderPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-[1100px] px-5 py-24 text-center text-sm text-muted-foreground">
          Loading downloader…
        </div>
      }
    >
      <DownloaderView />
    </Suspense>
  )
}
