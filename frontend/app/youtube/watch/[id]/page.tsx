import { WatchView } from '@/components/youtube/watch-view'

export default async function WatchPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <WatchView videoId={decodeURIComponent(id)} />
}
