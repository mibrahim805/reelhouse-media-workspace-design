import { SearchProvider } from '@/components/youtube/search-store'

export default function YoutubeLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <SearchProvider>{children}</SearchProvider>
}
