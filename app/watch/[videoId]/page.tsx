export function generateStaticParams() { return [{ videoId: 'placeholder' }] }

import { OnlineWatch } from '@/components/screens/watch/online-watch-screen'

export default async function Page({ params }: { params: Promise<{ videoId: string }> }) {
  return <OnlineWatch videoId={(await params).videoId} />
}
