const BACKEND_BASE_URL = (
  process.env.BACKEND_BASE_URL ||
  process.env.NEXT_PUBLIC_BACKEND_BASE_URL ||
  ''
).replace(/\/+$/, '')

const POST_ENDPOINTS = new Set([
  'fetch-info',
  'youtube-search',
  'youtube-topic',
  'start-download',
])

function cleanPath(parts: string[]) {
  return parts.join('/').replace(/^\/+|\/+$/g, '')
}

function backendUrl(path: string) {
  if (!BACKEND_BASE_URL) {
    throw new Error(
      'BACKEND_BASE_URL or NEXT_PUBLIC_BACKEND_BASE_URL is not configured.',
    )
  }

  return new URL(`${cleanPath([path])}/`, `${BACKEND_BASE_URL}/`).toString()
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

async function getCsrf(inboundCookie = '') {
  const existingToken = readCookie(inboundCookie, 'csrftoken')
  if (existingToken) {
    return {
      token: decodeURIComponent(existingToken),
      cookie: inboundCookie,
    }
  }

  const headers: HeadersInit = {}
  if (inboundCookie) headers.Cookie = inboundCookie

  const response = await fetch(backendUrl('csrf'), {
    headers,
    cache: 'no-store',
  })

  const cookieHeader = getSetCookies(response.headers).join('; ')
  const match = cookieHeader.match(/csrftoken=([^;]+)/)

  if (!response.ok || !match) {
    throw new Error('Could not get a CSRF token from the backend.')
  }

  const token = decodeURIComponent(match[1])
  return {
    token,
    cookie: mergeCookieHeaders(inboundCookie, `csrftoken=${token}`),
  }
}

function readCookie(cookieHeader: string, name: string) {
  const prefix = `${name}=`
  return cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length)
}

function mergeCookieHeaders(...headers: string[]) {
  const cookies = new Map<string, string>()

  headers
    .filter(Boolean)
    .flatMap((header) => header.split(';'))
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((cookie) => {
      const name = cookie.split('=')[0]
      if (name) cookies.set(name, cookie)
    })

  return Array.from(cookies.values()).join('; ')
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
    const csrf = await getCsrf(inboundCookie)
    const response = await fetch(backendUrl(path), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Cookie: csrf.cookie,
        'X-CSRFToken': csrf.token,
        'X-Requested-With': 'XMLHttpRequest',
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

  if (!path.startsWith('progress/')) {
    return jsonError('Unknown backend endpoint.', 404)
  }

  try {
    const inboundCookie = request.headers.get('cookie') ?? ''
    const headers: HeadersInit = {
      'X-Requested-With': 'XMLHttpRequest',
    }
    if (inboundCookie) headers.Cookie = inboundCookie

    const response = await fetch(backendUrl(path), {
      headers,
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
