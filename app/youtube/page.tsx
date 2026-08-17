import { Suspense } from 'react'
import { WorkspaceView } from '@/components/youtube/workspace-view'

export default function YoutubePage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading workspace…</div>}>
      <WorkspaceView />
    </Suspense>
  )
}
