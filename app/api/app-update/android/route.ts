import { readFileSync, statSync } from 'node:fs'

export const dynamic = 'force-static'
export const runtime = 'nodejs'

const METADATA_PATH = process.env.REELHOUSE_ANDROID_METADATA_PATH?.trim()
  || '/app/android/app-version.json'
const APK_PATH = process.env.REELHOUSE_ANDROID_APK_PATH?.trim()
  || '/app/android/Reelhouse-Android-arm64.apk'

type AppVersion = {
  versionCode: number
  versionName: string
}

function currentVersion(): AppVersion {
  try {
    const metadata = JSON.parse(readFileSync(METADATA_PATH, 'utf8')) as Partial<AppVersion>
    const versionCode = metadata.versionCode
    if (
      typeof versionCode === 'number'
      && Number.isInteger(versionCode)
      && versionCode > 0
      && typeof metadata.versionName === 'string'
      && metadata.versionName.trim()
    ) {
      return { versionCode, versionName: metadata.versionName.trim() }
    }
  } catch {
    // Local development does not have the Android build output mounted.
  }

  const versionCode = Number.parseInt(process.env.REELHOUSE_ANDROID_VERSION_CODE || '39', 10)
  return {
    versionCode: Number.isInteger(versionCode) && versionCode > 0 ? versionCode : 39,
    versionName: process.env.REELHOUSE_ANDROID_VERSION_NAME?.trim() || '1.6.20',
  }
}

export function GET() {
  try {
    if (!statSync(APK_PATH).isFile()) throw new Error('APK is not a file')
  } catch {
    return Response.json(
      { ok: false, error: 'The Android APK is not available on this deployment.' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  return Response.json(
    { ok: true, ...currentVersion() },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
