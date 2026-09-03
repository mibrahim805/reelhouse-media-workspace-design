import { NextRequest, NextResponse } from 'next/server'
import { searchOnline, getTrending, getOnlineVideo } from '@/services/online-search'

export const dynamic = 'force-static'
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const query = searchParams.get('q')?.trim() || ''
  const pageToken = searchParams.get('pageToken') || undefined
  const maxResults = Math.min(parseInt(searchParams.get('maxResults') || '20'), 50)
  const type = searchParams.get('type') || 'search'

  try {
    if (type === 'video') {
      const video = await getOnlineVideo(searchParams.get('id') || '')
      return NextResponse.json({ video, configured: Boolean(process.env.YOUTUBE_API_KEY) })
    }
    if (type === 'trending' || !query) {
      const data = await getTrending(maxResults)
      return NextResponse.json(data)
    }
    const data = await searchOnline(query, { pageToken, maxResults })
    return NextResponse.json(data)
  } catch (err) {
    return NextResponse.json(
      { results: [], nextPageToken: null, totalResults: 0, query, configured: false, error: String(err) },
      { status: 500 },
    )
  }
}
