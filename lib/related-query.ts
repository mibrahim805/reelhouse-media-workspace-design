type RelatedVideo = {
  title?: string
  channel?: string
  category?: string
}

type SearchVideo = RelatedVideo & { id?: string }

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'at', 'by', 'from', 'for', 'how', 'in', 'is',
  'it', 'of', 'on', 'or', 'the', 'this', 'to', 'via', 'with', 'you', 'your',
])
const GENERIC_CHANNEL_WORDS = new Set(['unknown', 'channel', 'youtube'])

function normalizedWords(value: string) {
  return value
    .replace(/[\u0000-\u001f]+/g, ' ')
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .split(/\s+/)
    .map(word => word.replace(/^['-]+|['-]+$/g, '').toLocaleLowerCase())
    .filter(word => word.length > 2 && !STOP_WORDS.has(word))
}

export function relatedTopicTerms(video: RelatedVideo) {
  const title = normalizedWords(video.title || '')
  const category = normalizedWords(video.category || '')
  const channel = normalizedWords(video.channel || '').filter(word => !GENERIC_CHANNEL_WORDS.has(word))
  const terms: string[] = []
  for (const word of [...title, ...category, ...channel.slice(0, 2)]) {
    if (!terms.includes(word)) terms.push(word)
  }
  return terms
}

export function hasUsableRelatedTitle(title?: string) {
  const normalized = (title || '').trim().toLocaleLowerCase()
  return Boolean(normalized) && normalized !== 'youtube video' && normalized !== 'untitled video'
}

export function buildRelatedVideoQuery(video: RelatedVideo) {
  const title = (video.title || '').replace(/[\u0000-\u001f]+/g, ' ').replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
  const words = relatedTopicTerms(video)
  const seen = new Set<string>()
  const unique = words.filter(word => {
    const key = word.toLocaleLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  return (unique.length ? unique : [title.trim()]).join(' ').slice(0, 140).trim()
}

/**
 * Search is intentionally broad, but the related rail is not. Keep only
 * results that share a meaningful topic term with the current video, while
 * preserving the provider's relevance order for ties.
 */
export function filterRelatedVideos<T extends SearchVideo>(videos: T[], currentId: string, currentVideo: RelatedVideo, limit = 10) {
  const terms = relatedTopicTerms(currentVideo)
  if (!terms.length) return []
  const current = currentId.trim()
  const seen = new Set<string>(current ? [current] : [])
  return videos
    .map((video, index) => {
      const haystack = normalizedWords(`${video.title || ''} ${video.channel || ''}`)
      const score = terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0)
      return { video, index, score }
    })
    .filter(({ video, score }) => Boolean(video.id) && score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .filter(({ video }) => {
      const id = video.id!.trim()
      if (seen.has(id)) return false
      seen.add(id)
      return true
    })
    .slice(0, limit)
    .map(({ video }) => video)
}
