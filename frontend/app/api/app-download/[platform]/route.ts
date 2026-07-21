import { createReadStream, statSync } from 'node:fs'
import { Readable } from 'node:stream'
import { findAppPackage } from '@/lib/app-downloads.server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type RouteContext = {
  params: Promise<{ platform: string }>
}

function contentType(filename: string) {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.exe')) return 'application/vnd.microsoft.portable-executable'
  if (lower.endsWith('.zip')) return 'application/zip'
  if (lower.endsWith('.deb')) return 'application/vnd.debian.binary-package'
  if (lower.endsWith('.apk')) return 'application/vnd.android.package-archive'
  return 'application/octet-stream'
}

function disposition(filename: string) {
  const ascii = filename.replace(/[^\x20-\x7e]|["\\]/g, '_')
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}

function parseRange(value: string | null, size: number) {
  if (!value) return null
  const match = value.match(/^bytes=(\d*)-(\d*)$/)
  if (!match || (!match[1] && !match[2])) return false

  let start: number
  let end: number

  if (!match[1]) {
    const suffixLength = Number(match[2])
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return false
    start = Math.max(0, size - suffixLength)
    end = size - 1
  } else {
    start = Number(match[1])
    end = match[2] ? Number(match[2]) : size - 1
  }

  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    end < start ||
    start >= size
  ) {
    return false
  }

  return { start, end: Math.min(end, size - 1) }
}

async function servePackage(
  request: Request,
  context: RouteContext,
  includeBody: boolean,
) {
  const { platform } = await context.params
  const format = new URL(request.url).searchParams.get('format')
  const appPackage = findAppPackage(platform, format)

  if (!appPackage) {
    return Response.json(
      { error: 'This app package is not available on the server yet.' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  if (appPackage.remoteUrl) {
    return Response.redirect(appPackage.remoteUrl, 307)
  }

  if (!appPackage.filePath) {
    return Response.json({ error: 'App package is unavailable.' }, { status: 404 })
  }

  let size: number
  try {
    size = statSync(appPackage.filePath).size
  } catch {
    return Response.json({ error: 'App package is unavailable.' }, { status: 404 })
  }

  const range = parseRange(request.headers.get('range'), size)
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
    'Content-Disposition': disposition(appPackage.filename),
    'Content-Length': String(end - start + 1),
    'Content-Type': contentType(appPackage.filename),
    'X-Content-Type-Options': 'nosniff',
  })

  if (range) headers.set('Content-Range', `bytes ${start}-${end}/${size}`)

  const body = includeBody
    ? (Readable.toWeb(
        createReadStream(appPackage.filePath, { start, end }),
      ) as ReadableStream<Uint8Array>)
    : null

  return new Response(body, {
    status: range ? 206 : 200,
    headers,
  })
}

export function GET(request: Request, context: RouteContext) {
  return servePackage(request, context, true)
}

export function HEAD(request: Request, context: RouteContext) {
  return servePackage(request, context, false)
}
