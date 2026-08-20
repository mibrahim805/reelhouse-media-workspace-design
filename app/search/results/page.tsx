import { Suspense } from 'react'
import { SearchResultsScreen } from '@/components/screens/search/search-results-screen'

export default function SearchResultsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-24 text-sm text-[#a3a3a3]">Loading results…</div>}>
      <SearchResultsScreen />
    </Suspense>
  )
}
