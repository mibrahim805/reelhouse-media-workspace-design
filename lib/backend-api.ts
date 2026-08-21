import { normalizeQualityOptions, normalizeQualityValue, type QualityOption } from '@/lib/quality-preferences'

export type { QualityOption } from '@/lib/quality-preferences'
export type MediaInfo = { sourceUrl: string; title: string; channel: string; duration: string; thumbnail: string; platform: string; qualities: QualityOption[]; embedUrl: string; canEmbed: boolean }
export type DownloadResult = { title: string; filename: string; fileUrl: string; filesizeMb: number; sourceUrl: string }
export type BackendJob = { status: 'queued'|'downloading'|'processing'|'complete'|'error'|'canceled'; percent: number; speed?: number|null; eta?: number|null; error?: string|null; result?: DownloadResult|null }
export type LocalMediaItem = { id: string; title: string; channel: string; thumbnail: string; fileUrl: string; filename: string; size: string; source: 'download'|'device'; mediaType: 'video'|'audio'; qualityValue?: string; status: 'completed'; startedAt: number }
export type LocalMediaResponse = { permissionRequired: boolean; downloads: LocalMediaItem[]; videos: LocalMediaItem[]; music: LocalMediaItem[] }
export type { OnlineVideo } from '@/types/media'
import type { OnlineVideo } from '@/types/media'
export type YoutubeSearchVideo = OnlineVideo

type Envelope<T> = T & { ok: boolean; error?: string }
async function read<T>(response: Response): Promise<Envelope<T>> {
  const text = await response.text()
  let data: Envelope<T>
  try { data = JSON.parse(text) as Envelope<T> } catch { throw new Error(response.status === 502 ? 'Backend unavailable. Check that Django is running.' : 'The backend returned an invalid response.') }
  if (!response.ok || !data.ok) throw new Error(data.error || `Request failed (${response.status}).`)
  return data
}
async function post<T>(endpoint:string, body:Record<string,unknown>) { return read<T>(await fetch(`/api/backend/${endpoint}`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store'})) }
async function get<T>(endpoint:string) { return read<T>(await fetch(`/api/backend/${endpoint}`, {cache:'no-store'})) }
function fileUrl(path:string) { return path ? `/api/backend/${path.replace(/^\//,'')}` : '' }

export async function fetchMediaInfo(url:string):Promise<MediaInfo> {
  const {video} = await post<{video:Record<string,unknown>}>('fetch-info',{url})
  const qualities = normalizeQualityOptions((video.qualities || []) as Array<Record<string,unknown>>)
  return {sourceUrl:String(video.source_url||url),title:String(video.title||'Untitled video'),channel:String(video.channel||'Unknown channel'),duration:String(video.duration||'Unknown duration'),thumbnail:String(video.thumbnail||''),platform:String(video.platform||'Video'),qualities,embedUrl:String(video.embed_url||''),canEmbed:Boolean(video.can_embed)}
}
function normalizeYoutubeVideo(video: Record<string, unknown>): YoutubeSearchVideo {
  return {
    id: String(video.id || ''),
    title: String(video.title || 'Untitled video'),
    channel: String(video.channel || 'Unknown channel'),
    duration: String(video.duration || 'Unknown duration'),
    thumbnail: String(video.thumbnail || ''),
    sourceUrl: String(video.source_url || video.webpage_url || ''),
  }
}
export async function searchYouTube(query:string, limit=12):Promise<YoutubeSearchVideo[]> {
  const {videos} = await post<{videos:Array<Record<string,unknown>>}>('youtube-search',{query,limit})
  return videos.map(normalizeYoutubeVideo)
}
export async function fetchYouTubeTopic(topic='All'):Promise<{topic:string;query:string;videos:YoutubeSearchVideo[]}> {
  const data = await post<{topic:string;query:string;videos:Array<Record<string,unknown>>}>('youtube-topic',{topic})
  return {topic:data.topic,query:data.query,videos:data.videos.map(normalizeYoutubeVideo)}
}
export async function startBackendDownload(url:string,quality:string){const data=await post<{job_id:string}>('start-download',{url,quality:normalizeQualityValue(quality)});return data.job_id}
export async function cancelBackendDownload(jobId:string){await post<Record<string,never>>('cancel-download',{job_id:jobId})}
export async function fetchBackendProgress(jobId:string):Promise<BackendJob>{
  const {job}=await get<{job:Record<string,unknown>}>(`progress/${jobId}`)
  const raw=job.result as Record<string,unknown>|null|undefined
  return {status:(job.status||'queued') as BackendJob['status'],percent:Number(job.percent||0),speed:job.speed as number|null|undefined,eta:job.eta as number|null|undefined,error:job.error as string|null|undefined,result:raw?{title:String(raw.title||''),filename:String(raw.filename||'download'),fileUrl:fileUrl(String(raw.file_url||'')),filesizeMb:Number(raw.filesize_mb||0),sourceUrl:String(raw.source_url||'')}:null}
}
export async function fetchLocalMedia(): Promise<LocalMediaResponse> { return get<LocalMediaResponse>('local-media') }
