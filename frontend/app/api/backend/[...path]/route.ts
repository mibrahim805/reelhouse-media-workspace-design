const BACKEND_BASE_URL = (
  process.env.REELHOUSE_INTERNAL_BACKEND_URL ||
  process.env.BACKEND_BASE_URL ||
  process.env.NEXT_PUBLIC_BACKEND_BASE_URL ||
  ''
).replace(/\/+$/, '')

const POST_ENDPOINTS = new Set([
  'fetch-info',
  'youtube-search',
  'youtube-topic',
  'start-download',
  'account/register',
  'account/login',
  'account/logout',
  'account/search',
  'account/google/start',
])

function cleanPath(parts: string[]) {
  return parts.join('/').replace(/^\/+|\/+$/g, '')
}

function backendUrl(path: string) {
  if (!BACKEND_BASE_URL) {
    throw new Error(
      'The internal backend URL is not configured.',
    )
  }

  const cleanedPath = cleanPath([path])
  const targetPath = cleanedPath.startsWith('media/')
    ? cleanedPath
    : `${cleanedPath}/`
  return new URL(targetPath, `${BACKEND_BASE_URL}/`).toString()
}

function backendLabel() {
  return BACKEND_BASE_URL || 'the configured backend'
}

function getSetCookies(headers: Headers) {
  const withGetSetCookie = headers as Headers & {
    getSetCookie?: () => string[]
  }
  return withGetSetCookie.getSetCookie?.() ?? [headers.get('set-cookie') ?? '']
}

async function proxyJsonResponse(response: Response) {
  const headers = new Headers()
  headers.set(
    'Content-Type',
    response.headers.get('content-type') ?? 'application/json',
  )
  getSetCookies(response.headers)
    .filter(Boolean)
    .forEach((cookie) => headers.append('Set-Cookie', cookie))

  return new Response(await response.text(), {
    status: response.status,
    headers,
  })
}

function proxyFileResponse(response: Response) {
  const headers = new Headers()
  const passthroughHeaders = [
    'accept-ranges',
    'content-disposition',
    'content-length',
    'content-range',
    'content-type',
    'last-modified',
  ]

  passthroughHeaders.forEach((name) => {
    const value = response.headers.get(name)
    if (value) headers.set(name, value)
  })
  headers.set('Cache-Control', 'private, no-store')
  headers.set('X-Content-Type-Options', 'nosniff')

  return new Response(response.body, {
    status: response.status,
    headers,
  })
}

async function readPostBody(request: Request) {
  const contentType = request.headers.get('content-type') ?? ''

  if (contentType.includes('application/json')) {
    return (await request.json()) as Record<string, unknown>
  }

  if (contentType.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(await request.text()))
  }

  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData()
    return Object.fromEntries(formData.entries())
  }

  return {}
}

function formEncode(payload: Record<string, unknown>) {
  const form = new URLSearchParams()

  Object.entries(payload).forEach(([key, value]) => {
    if (value === undefined || value === null) return
    form.set(key, String(value))
  })

  return form
}

function jsonError(message: string, status = 500) {
  return Response.json({ ok: false, error: message }, { status })
}

export async function POST(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path: parts } = await context.params
  const path = cleanPath(parts)

  if (!POST_ENDPOINTS.has(path)) {
    return jsonError('Unknown backend endpoint.', 404)
  }

  try {
    const payload = await readPostBody(request)
    const inboundCookie = request.headers.get('cookie') ?? ''
    const response = await fetch(backendUrl(path), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        ...(inboundCookie ? { Cookie: inboundCookie } : {}),
      },
      body: formEncode(payload).toString(),
      cache: 'no-store',
    })

    return proxyJsonResponse(response)
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown error.'
    return jsonError(
      `Could not reach backend at ${backendLabel()}. ${detail}`,
      502,
    )
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path: parts } = await context.params
  const path = cleanPath(parts)

  const isProgressRequest = path.startsWith('progress/')
  const isMediaRequest = path.startsWith('media/')
  const isAccountRequest = path === 'account/me' || path === 'account/google/start'

  if (!isProgressRequest && !isMediaRequest && !isAccountRequest) {
    return jsonError('Unknown backend endpoint.', 404)
  }

  try {
    const inboundCookie = request.headers.get('cookie') ?? ''
    const headers: HeadersInit = {
      'X-Requested-With': 'XMLHttpRequest',
    }
    if (inboundCookie) headers.Cookie = inboundCookie
    const range = request.headers.get('range')
    if (range && isMediaRequest) headers.Range = range

    const response = await fetch(backendUrl(path), {
      headers,
      cache: 'no-store',
    })

    return isMediaRequest
      ? proxyFileResponse(response)
      : proxyJsonResponse(response)
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown error.'
    return jsonError(
      `Could not reach backend at ${backendLabel()}. ${detail}`,
      502,
    )
  }
}
