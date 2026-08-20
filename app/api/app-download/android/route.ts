import { createReadStream, statSync } from 'node:fs'
import { Readable } from 'node:stream'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const APK_FILENAME = 'Reelhouse-Android-arm64.apk'

function apkPath() {
  const configured = process.env.REELHOUSE_ANDROID_APK_PATH?.trim()
  return configured || `/app/android/${APK_FILENAME}`
}

function byteRange(value: string | null, size: number) {
  if (!value) return null
  const match = value.match(/^bytes=(\d*)-(\d*)$/)
  if (!match || (!match[1] && !match[2])) return false

  const start = match[1]
    ? Number(match[1])
    : Math.max(0, size - Number(match[2]))
  const requestedEnd = match[2] ? Number(match[2]) : size - 1
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd)) return false
  if (start < 0 || requestedEnd < start || start >= size) return false

  return { start, end: Math.min(requestedEnd, size - 1) }
}

function responseFor(request: Request, includeBody: boolean) {
  const file = apkPath()
  let size: number
  try {
    size = statSync(file).size
  } catch {
    return Response.json(
      { ok: false, error: 'The Android APK is not available on this deployment.' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  const range = byteRange(request.headers.get('range'), size)
  if (range === false) {
    return new Response(null, {
      status: 416,
      headers: { 'Content-Range': `bytes */${size}` },
    })
  }

  const start = range?.start ?? 0
  const end = range?.end ?? size - 1
  const headers = new Headers({
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, no-store',
    'Content-Disposition': `attachment; filename="${APK_FILENAME}"`,
    'Content-Length': String(end - start + 1),
    'Content-Type': 'application/vnd.android.package-archive',
    'X-Content-Type-Options': 'nosniff',
  })
  if (range) headers.set('Content-Range', `bytes ${start}-${end}/${size}`)

  const body = includeBody
    ? (Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream<Uint8Array>)
    : null
  return new Response(body, { status: range ? 206 : 200, headers })
}

export function GET(request: Request) {
  return responseFor(request, true)
}

export function HEAD(request: Request) {
  return responseFor(request, false)
}
