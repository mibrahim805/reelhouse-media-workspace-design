// Server-side only — never import in client components.
// Calls the YouTube Data API v3. Falls back gracefully when no key is set.

export type OnlineSearchResult = {
  id: string
  title: string
  channel: string
  channelId: string
  thumbnail: string
  duration: string | null
  views: string | null
  published: string | null
  publishedAt: string | null
  platform: 'youtube'
  sourceUrl: string
  videoId: string
  description: string
}

export type OnlineSearchResponse = {
  results: OnlineSearchResult[]
  nextPageToken: string | null
  totalResults: number
  query: string
  configured: boolean
  error: string | null
}

export type TrendingResult = OnlineSearchResult

// Parse ISO 8601 duration PT4M13S → "4:13"
function parseIso8601Duration(iso: string): string {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  if (!match) return '0:00'
  const h = parseInt(match[1] || '0')
  const m = parseInt(match[2] || '0')
  const s = parseInt(match[3] || '0')
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  return `${m}:${s.toString().padStart(2, '0')}`
}

// Format view count → "1.2M views"
function formatViews(count: string): string {
  const n = parseInt(count, 10)
  if (isNaN(n)) return ''
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B views`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M views`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K views`
  return `${n} views`
}

// Format published date → "2 days ago"
function formatPublished(iso: string): string {
  const d = new Date(iso)
  const now = Date.now()
  const diff = now - d.getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  const weeks = Math.floor(days / 7)
  const months = Math.floor(days / 30)
  const years = Math.floor(days / 365)
  if (minutes < 60) return `${minutes} minutes ago`
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`
  if (days < 7) return `${days} day${days !== 1 ? 's' : ''} ago`
  if (weeks < 4) return `${weeks} week${weeks !== 1 ? 's' : ''} ago`
  if (months < 12) return `${months} month${months !== 1 ? 's' : ''} ago`
  return `${years} year${years !== 1 ? 's' : ''} ago`
}

const YT_API_BASE = 'https://www.googleapis.com/youtube/v3'

async function ytFetch(endpoint: string, params: Record<string, string>): Promise<unknown> {
  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) throw new Error('YOUTUBE_API_KEY not configured')
  const url = new URL(`${YT_API_BASE}/${endpoint}`)
  url.searchParams.set('key', apiKey)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = await fetch(url.toString(), { next: { revalidate: 60 } })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`YouTube API error ${res.status}: ${text.slice(0, 200)}`)
  }
  return res.json()
}

// Fetch video durations and stats for a batch of video IDs
async function fetchVideoDetails(ids: string[]): Promise<Map<string, { duration: string; views: string }>> {
  if (!ids.length) return new Map()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await ytFetch('videos', { part: 'contentDetails,statistics', id: ids.join(','), maxResults: '50' }) as any
  const map = new Map<string, { duration: string; views: string }>()
  for (const item of data.items || []) {
    map.set(item.id, {
      duration: parseIso8601Duration(item.contentDetails?.duration || ''),
      views: formatViews(item.statistics?.viewCount || '0'),
    })
  }
  return map
}

export async function searchOnline(
  query: string,
  { pageToken, maxResults = 20 }: { pageToken?: string; maxResults?: number } = {},
): Promise<OnlineSearchResponse> {
  if (!process.env.YOUTUBE_API_KEY) {
    return { results: [], nextPageToken: null, totalResults: 0, query, configured: false, error: null }
  }
  try {
    const params: Record<string, string> = {
      part: 'snippet',
      q: query,
      type: 'video',
      maxResults: String(maxResults),
      safeSearch: 'none',
    }
    if (pageToken) params.pageToken = pageToken
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await ytFetch('search', params) as any
    const items = data.items || []
    const videoIds: string[] = items.map((i: any) => i.id?.videoId).filter(Boolean)
    const details = await fetchVideoDetails(videoIds)

    const results: OnlineSearchResult[] = items
      .filter((i: any) => i.id?.kind === 'youtube#video')
      .map((i: any) => {
        const snippet = i.snippet || {}
        const videoId: string = i.id.videoId
        const det = details.get(videoId)
        const best =
          snippet.thumbnails?.maxres?.url ||
          snippet.thumbnails?.high?.url ||
          snippet.thumbnails?.medium?.url ||
          snippet.thumbnails?.default?.url || ''
        return {
          id: videoId,
          videoId,
          title: snippet.title || 'Untitled',
          channel: snippet.channelTitle || '',
          channelId: snippet.channelId || '',
          thumbnail: best,
          duration: det?.duration || null,
          views: det?.views || null,
          published: snippet.publishedAt ? formatPublished(snippet.publishedAt) : null,
          publishedAt: snippet.publishedAt || null,
          description: snippet.description || '',
          platform: 'youtube' as const,
          sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
        }
      })

    return {
      results,
      nextPageToken: data.nextPageToken || null,
      totalResults: data.pageInfo?.totalResults || results.length,
      query,
      configured: true,
      error: null,
    }
  } catch (err) {
    return {
      results: [],
      nextPageToken: null,
      totalResults: 0,
      query,
      configured: true,
      error: err instanceof Error ? err.message : 'Search failed',
    }
  }
}

export async function getTrending(maxResults = 20): Promise<OnlineSearchResponse> {
  if (!process.env.YOUTUBE_API_KEY) {
    return { results: [], nextPageToken: null, totalResults: 0, query: 'trending', configured: false, error: null }
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await ytFetch('videos', {
      part: 'snippet,contentDetails,statistics',
      chart: 'mostPopular',
      maxResults: String(maxResults),
      regionCode: 'US',
    }) as any

    const results: OnlineSearchResult[] = (data.items || []).map((item: any) => {
      const snippet = item.snippet || {}
      const best =
        snippet.thumbnails?.maxres?.url ||
        snippet.thumbnails?.high?.url ||
        snippet.thumbnails?.medium?.url || ''
      return {
        id: item.id,
        videoId: item.id,
        title: snippet.title || 'Untitled',
        channel: snippet.channelTitle || '',
        channelId: snippet.channelId || '',
        thumbnail: best,
        duration: parseIso8601Duration(item.contentDetails?.duration || ''),
        views: formatViews(item.statistics?.viewCount || '0'),
        published: snippet.publishedAt ? formatPublished(snippet.publishedAt) : null,
        publishedAt: snippet.publishedAt || null,
        description: snippet.description || '',
        platform: 'youtube' as const,
        sourceUrl: `https://www.youtube.com/watch?v=${item.id}`,
      }
    })

    return { results, nextPageToken: null, totalResults: results.length, query: 'trending', configured: true, error: null }
  } catch (err) {
    return {
      results: [],
      nextPageToken: null,
      totalResults: 0,
      query: 'trending',
      configured: true,
      error: err instanceof Error ? err.message : 'Trending fetch failed',
    }
  }
}

export async function getOnlineVideo(videoId: string): Promise<OnlineSearchResult | null> {
  if (!process.env.YOUTUBE_API_KEY || !videoId) return null
  try {
    const data = await ytFetch('videos', { part: 'snippet,contentDetails,statistics', id: videoId }) as any
    const item = data.items?.[0]
    if (!item) return null
    const snippet = item.snippet || {}
    return {
      id: item.id, videoId: item.id, title: snippet.title || 'Untitled',
      channel: snippet.channelTitle || '', channelId: snippet.channelId || '',
      thumbnail: snippet.thumbnails?.maxres?.url || snippet.thumbnails?.high?.url || '',
      duration: parseIso8601Duration(item.contentDetails?.duration || ''),
      views: formatViews(item.statistics?.viewCount || '0'),
      published: snippet.publishedAt ? formatPublished(snippet.publishedAt) : null,
      publishedAt: snippet.publishedAt || null, description: snippet.description || '',
      platform: 'youtube', sourceUrl: `https://www.youtube.com/watch?v=${item.id}`,
    }
  } catch { return null }
}
