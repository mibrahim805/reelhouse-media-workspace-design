type RelatedVideo = {
  title?: string
  channel?: string
  category?: string
}

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'at', 'by', 'from', 'for', 'how', 'in', 'is',
  'it', 'of', 'on', 'or', 'the', 'this', 'to', 'via', 'with', 'you', 'your',
])
const GENERIC_CHANNEL_WORDS = new Set(['unknown', 'channel', 'youtube'])

export function buildRelatedVideoQuery(video: RelatedVideo) {
  const title = (video.title || '').replace(/[\u0000-\u001f]+/g, ' ').replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
  const titleWords = title.split(/\s+/).filter(word => {
    const normalized = word.replace(/^['-]+|['-]+$/g, '')
    return normalized.length > 2 && !STOP_WORDS.has(normalized.toLocaleLowerCase())
  })
  const categoryWords = (video.category || '').split(/\s+/).filter(Boolean)
  const channelWords = (video.channel || '').split(/\s+/).filter(word => word.length > 2 && !GENERIC_CHANNEL_WORDS.has(word.toLocaleLowerCase()))
  const words = [...titleWords, ...categoryWords, ...channelWords.slice(0, 2)]
  const seen = new Set<string>()
  const unique = words.filter(word => {
    const key = word.toLocaleLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  return (unique.length ? unique : [title.trim() || 'related videos']).join(' ').slice(0, 140).trim()
}
