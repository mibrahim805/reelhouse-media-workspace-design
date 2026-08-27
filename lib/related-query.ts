type RelatedVideo = {
  title?: string
  channel?: string
  category?: string
  description?: string
  tags?: string[]
}

type SearchVideo = RelatedVideo & { id?: string }

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'at', 'by', 'from', 'for', 'how', 'in', 'is',
  'it', 'of', 'on', 'or', 'the', 'this', 'to', 'via', 'with', 'you', 'your',
])
const GENERIC_CHANNEL_WORDS = new Set(['unknown', 'channel', 'youtube'])
const TITLE_NOISE = new Set(['official', 'video', 'audio', 'lyrics', 'lyric', 'hd', '4k', 'full', 'song', 'music'])

const LANGUAGE_HINTS = [
  { label: 'Punjabi', words: ['punjabi', 'bhangra', 'gurbani', 'sidhumoosewala', 'sidhu moose wala', 'diljit', 'gippy', 'jass', 'karan aujla', 'ap dhillon', 'sharry mann', 'harrdy sandhu', 'babbu maan'] },
  { label: 'Hindi', words: ['hindi', 'bollywood', 't-series', 'tseries', 'arijit', 'kumar sanu', 'alka yagnik', 'udit narayan', 'lata mangeshkar', 'kishore kumar', 'sonu nigam', 'shreya ghoshal'] },
  { label: 'Urdu', words: ['urdu', 'qawwali', 'nusrat', 'rahat fateh', 'atif aslam', 'ali zafar', 'coke studio pakistan'] },
  { label: 'Bengali', words: ['bengali', 'bangla', 'tollywood'] },
  { label: 'Tamil', words: ['tamil', 'kollywood'] },
  { label: 'Telugu', words: ['telugu'] },
]

const STYLE_HINTS = [
  { label: 'Qawwali', words: ['qawwali'] },
  { label: 'Ghazal', words: ['ghazal'] },
  { label: 'Bhajan', words: ['bhajan', 'bhakti'] },
  { label: 'Sufi', words: ['sufi'] },
  { label: 'Lofi', words: ['lofi', 'lo-fi'] },
  { label: 'Remix', words: ['remix', 'rework', 'mashup'] },
  { label: 'Rap', words: ['rap', 'hip hop', 'hip-hop'] },
  { label: 'K-pop', words: ['k-pop', 'kpop'] },
]

function normalizedWords(value: string) {
  return value
    .replace(/[\u0000-\u001f]+/g, ' ')
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .split(/\s+/)
    .map(word => word.replace(/^['-]+|['-]+$/g, '').toLocaleLowerCase())
    .filter(word => word.length > 2 && !STOP_WORDS.has(word))
}

function sourceText(video: RelatedVideo) {
  return [video.title, video.channel, video.category, video.description, ...(video.tags || [])]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase()
}

function hasHint(text: string, hint: { words: string[] }) {
  return hint.words.some(word => {
    const escaped = word.toLocaleLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, 'iu').test(text)
  })
}

function eraHint(text: string) {
  if (/\b(?:90s|90's|nineties)\b/i.test(text)) return '1990s'
  if (/\b(?:80s|80's|eighties)\b/i.test(text)) return '1980s'
  if (/\b(?:2000s|00s|00's|noughties)\b/i.test(text)) return '2000s'
  const year = text.match(/\b(19\d{2}|20\d{2})\b/)?.[1]
  if (!year) return ''
  const numericYear = Number(year)
  if (numericYear < 2010) return `${Math.floor(numericYear / 10) * 10}s`
  return ''
}

function relatedIntentTerms(video: RelatedVideo) {
  const text = sourceText(video)
  const terms: string[] = []
  const add = (term: string) => { if (!terms.includes(term)) terms.push(term) }
  LANGUAGE_HINTS.filter(hint => hasHint(text, hint)).forEach(hint => add(hint.label))
  STYLE_HINTS.filter(hint => hasHint(text, hint)).forEach(hint => add(hint.label))
  const era = eraHint(text)
  if (era) add(era)
  return terms
}

export function relatedTopicTerms(video: RelatedVideo) {
  const title = normalizedWords(video.title || '')
  const category = normalizedWords(video.category || '')
  const channel = normalizedWords(video.channel || '').filter(word => !GENERIC_CHANNEL_WORDS.has(word))
  const terms: string[] = []
  const tags = (video.tags || []).flatMap(normalizedWords)
  for (const word of [...relatedIntentTerms(video), ...title.slice(0, 4), ...category, ...tags.slice(0, 4), ...channel.slice(0, 2)]) {
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
  const source = sourceText(video)
  const intent = relatedIntentTerms(video)
  const musicLike = /\b(?:song|songs|music|audio|lyrics|ost|soundtrack|remix|qawwali|ghazal|bhajan|bhangra|rap|lofi)\b/i.test(source)
  if (intent.length || musicLike) {
    if (!intent.length) intent.push('Music')
    if (!intent.some(term => /songs?|music/i.test(term))) intent.push('songs')
    if (intent.some(term => /1990s|1980s|2000s/.test(term))) intent.push('classic')
    return intent.join(' ').slice(0, 140).trim()
  }

  const words = normalizedWords(title).filter(word => !TITLE_NOISE.has(word)).slice(0, 3)
  const seen = new Set<string>()
  const unique = [...words, ...normalizedWords(video.channel || '').slice(0, 1)].filter(word => {
    const key = word.toLocaleLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  return (unique.length ? [...unique, 'similar videos'] : ['popular videos']).join(' ').slice(0, 140).trim()
}

function comparableTitle(title?: string) {
  return normalizedWords(title || '').filter(word => !TITLE_NOISE.has(word)).join(' ')
}

/**
 * Search is intentionally broad, but the related rail is not. Keep only
 * results that share a meaningful topic term with the current video, while
 * preserving the provider's relevance order for ties.
 */
export function filterRelatedVideos<T extends SearchVideo>(videos: T[], currentId: string, currentVideo: RelatedVideo, limit = 10) {
  const terms = relatedTopicTerms(currentVideo)
  const current = currentId.trim()
  const currentTitle = comparableTitle(currentVideo.title)
  const seen = new Set<string>(current ? [current] : [])
  return videos
    .map((video, index) => {
      const haystack = normalizedWords(`${video.title || ''} ${video.channel || ''}`)
      const score = terms.reduce((total, term) => total + (haystack.includes(term.toLocaleLowerCase()) ? 1 : 0), 0)
      return { video, index, score, comparable: comparableTitle(video.title) }
    })
    .filter(({ video, comparable }) => Boolean(video.id) && comparable !== currentTitle)
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
