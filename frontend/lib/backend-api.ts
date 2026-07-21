export const BACKEND_BASE_URL = (
  process.env.NEXT_PUBLIC_BACKEND_BASE_URL || ''
).replace(/\/+$/, '')

export type QualityOption = {
  value: string
  label: string
  note: string
  size: string
}

export type MediaVideo = {
  id: string
  title: string
  channel: string
  channelInitials: string
  thumbnail: string
  duration: string
  sourceUrl: string
  platform: string
  category?: string
  description?: string
  qualities?: QualityOption[]
  embedUrl?: string
  canEmbed?: boolean
}

export type DownloadResult = {
  title: string
  filename: string
  fileUrl: string
  filesizeMb: number
  sourceUrl: string
}

export type BackendJobStatus =
  | 'queued'
  | 'downloading'
  | 'processing'
  | 'complete'
  | 'error'

export type DownloadJob = {
  status: BackendJobStatus
  percent: number
  speed?: number | null
  eta?: number | null
  error?: string | null
  result?: DownloadResult | null
}

type ApiEnvelope<T> = T & {
  ok: boolean
  error?: string
}

type RawQuality = {
  value?: string
  label?: string
  extension?: string
  filesize_label?: string
}

type RawVideo = {
  id?: string
  title?: string
  channel?: string
  duration?: string
  thumbnail?: string
  source_url?: string
  platform?: string
  webpage_url?: string
  qualities?: RawQuality[]
  embed_url?: string
  can_embed?: boolean
}

type RawDownloadResult = {
  title?: string
  filename?: string
  file_url?: string
  filesize_mb?: number
  source_url?: string
}

type RawDownloadJob = {
  status?: BackendJobStatus
  percent?: number
  speed?: number | null
  eta?: number | null
  error?: string | null
  result?: RawDownloadResult | null
}

// Keep this list aligned with downloader.views.youtube_topic until the backend exposes topic discovery.
export const YOUTUBE_TOPICS = [
  'All',
  'Music',
  'Pakistani dramas',
  'News',
  'T-Series',
  'Atif Aslam',
  'Gaming',
  'Mixes',
  'Live',
]

function initials(value: string) {
  const words = value
    .replace(/[^a-zA-Z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)

  if (words.length === 0) return 'YT'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return words
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase()
}

export function youtubeUrlFromId(id: string) {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`
}

export function videoIdFromUrl(url: string) {
  try {
    const parsed = new URL(url)

    if (parsed.hostname.includes('youtu.be')) {
      return parsed.pathname.replace(/^\/+/, '').split('/')[0]
    }

    if (parsed.hostname.includes('youtube.com')) {
      return parsed.searchParams.get('v') ?? ''
    }
  } catch {
    return ''
  }

  return ''
}

export function youtubeEmbedUrl(video: Pick<MediaVideo, 'id' | 'sourceUrl'>) {
  const id = video.id || videoIdFromUrl(video.sourceUrl)
  return id ? `https://www.youtube.com/embed/${id}?autoplay=1&rel=0` : ''
}

function absoluteBackendUrl(path: string) {
  if (!path) return ''
  if (!BACKEND_BASE_URL) return path

  try {
    return new URL(path, `${BACKEND_BASE_URL}/`).toString()
  } catch {
    return path
  }
}

function normalizeQuality(quality: RawQuality): QualityOption {
  const label = quality.label || quality.value || 'Best'
  const extension = quality.extension?.toUpperCase()

  return {
    value: quality.value || 'best',
    label,
    note: extension ? `${extension} video` : 'Video',
    size: quality.filesize_label || 'Unknown size',
  }
}

function normalizeResult(result?: RawDownloadResult | null): DownloadResult | null {
  if (!result) return null

  return {
    title: result.title || result.filename || 'Downloaded video',
    filename: result.filename || 'download',
    fileUrl: absoluteBackendUrl(result.file_url || ''),
    filesizeMb: result.filesize_mb ?? 0,
    sourceUrl: result.source_url || '',
  }
}

function normalizeJob(job: RawDownloadJob): DownloadJob {
  return {
    status: job.status || 'queued',
    percent: job.percent ?? 0,
    speed: job.speed,
    eta: job.eta,
    error: job.error,
    result: normalizeResult(job.result),
  }
}

function normalizeVideo(raw: RawVideo, category?: string): MediaVideo {
  const sourceUrl = raw.source_url || raw.webpage_url || ''
  const id = raw.id || videoIdFromUrl(sourceUrl) || sourceUrl
  const channel = raw.channel || 'Unknown channel'
  const platform = raw.platform || 'YouTube'
  const qualities = raw.qualities?.map(normalizeQuality)

  return {
    id,
    title: raw.title || 'Untitled video',
    channel,
    channelInitials: initials(channel),
    thumbnail: raw.thumbnail || '',
    duration: raw.duration || 'Unknown duration',
    sourceUrl,
    platform,
    category,
    description: sourceUrl,
    qualities: qualities?.length ? qualities : undefined,
    embedUrl: raw.embed_url || '',
    canEmbed: raw.can_embed,
  }
}

async function readApiEnvelope<T>(response: Response) {
  const text = await response.text()
  let data: ApiEnvelope<T>

  try {
    data = JSON.parse(text) as ApiEnvelope<T>
  } catch {
    throw new Error(
      response.ok
        ? 'The backend returned an invalid response.'
        : `Request failed with status ${response.status}.`,
    )
  }

  if (!response.ok || !data.ok) {
    throw new Error(data.error || 'Request failed.')
  }

  return data
}

async function apiPost<T>(endpoint: string, payload: Record<string, unknown>) {
  const response = await fetch(`/api/backend/${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  })
  return readApiEnvelope<T>(response)
}

async function apiGet<T>(endpoint: string) {
  const response = await fetch(`/api/backend/${endpoint}`, {
    cache: 'no-store',
  })
  return readApiEnvelope<T>(response)
}

export async function fetchVideoInfo(url: string) {
  const payload = await apiPost<{ video: RawVideo }>('fetch-info', { url })
  return normalizeVideo(payload.video, payload.video.platform)
}

export async function searchYouTube(query: string) {
  const payload = await apiPost<{ videos: RawVideo[] }>('youtube-search', {
    query,
  })
  return payload.videos.map((video) => normalizeVideo(video, 'Search'))
}

export async function fetchYouTubeTopic(topic: string) {
  const payload = await apiPost<{
    topic: string
    query: string
    videos: RawVideo[]
  }>('youtube-topic', { topic })

  return {
    topic: payload.topic,
    query: payload.query,
    videos: payload.videos.map((video) => normalizeVideo(video, payload.topic)),
  }
}

export async function startBackendDownload(url: string, quality: string) {
  const payload = await apiPost<{ job_id: string }>('start-download', {
    url,
    quality,
  })

  return payload.job_id
}

export async function fetchDownloadProgress(jobId: string) {
  const payload = await apiGet<{ job: RawDownloadJob }>(`progress/${jobId}`)
  return normalizeJob(payload.job)
}
