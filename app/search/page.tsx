import { Suspense } from 'react'
import { OnlineSearchScreen } from '@/components/screens/search/search-screen'

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-24 text-sm text-[#a3a3a3]">Loading search…</div>}>
      <OnlineSearchScreen />
    </Suspense>
  )
}
