import { listAppPackages } from '@/lib/app-downloads.server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export function GET() {
  const packages = listAppPackages()
  const platforms = Object.fromEntries(
    Object.entries(packages).map(([platform, assets]) => [
      platform,
      {
        available: assets.length > 0,
        assets: assets.map((asset) => ({
          filename: asset.filename,
          format: asset.format,
          label: asset.label,
          size: asset.size,
          url: `/api/app-download/${platform}?format=${encodeURIComponent(asset.format)}`,
        })),
      },
    ]),
  )

  return Response.json(
    { platforms },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  )
}
