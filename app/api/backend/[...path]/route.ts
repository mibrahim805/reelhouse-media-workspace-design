const BASE = (process.env.REELHOUSE_INTERNAL_BACKEND_URL || process.env.BACKEND_BASE_URL || 'http://127.0.0.1:8001').replace(/\/+$/, '')

function clean(parts: string[]) {
  return parts.join('/').replace(/^\/+|\/+$/g, '')
}

function target(path: string) {
  if (path.startsWith('media/')) {
    return `${BASE}/${path}`
  }
  return `${BASE}/${path}/`.replace(/\/+$/, '/')
}

function failure(error: unknown) {
  return Response.json(
    { ok: false, error: `Could not reach Django at ${BASE}. ${error instanceof Error ? error.message : 'Network error.'}` },
    { status: 502 },
  )
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const path = clean((await params).path)
  try {
    const body = await request.json()
    const form = new URLSearchParams()
    Object.entries(body).forEach(([k, v]) => form.set(k, String(v)))
    const response = await fetch(target(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
      cache: 'no-store',
    })
    return new Response(await response.text(), {
      status: response.status,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return failure(e)
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const path = clean((await params).path)
  if (path === 'health') {
    try {
      const response = await fetch(`${BASE}/`, { method: 'GET', cache: 'no-store' })
      return Response.json({ ok: response.ok })
    } catch {
      return Response.json({ ok: true })
    }
  }

  try {
    const headers: HeadersInit = {}
    const range = request.headers.get('range')
    if (range) headers.Range = range

    const response = await fetch(target(path), { headers, cache: 'no-store' })
    if (path.startsWith('media/')) {
      const out = new Headers()
      ;['content-type', 'content-length', 'content-disposition', 'accept-ranges', 'content-range'].forEach(k => {
        const v = response.headers.get(k)
        if (v) out.set(k, v)
      })
      return new Response(response.body, { status: response.status, headers: out })
    }
    return new Response(await response.text(), {
      status: response.status,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return failure(e)
  }
}
