import 'server-only'

import { readdirSync, statSync } from 'node:fs'
import path from 'node:path'

export type AppPlatform = 'windows' | 'linux' | 'android'
export type AppPackageFormat =
  | 'setup'
  | 'portable'
  | 'zip'
  | 'appimage'
  | 'deb'
  | 'apk'

export type AppPackage = {
  platform: AppPlatform
  format: AppPackageFormat
  filename: string
  label: string
  size: number | null
  filePath?: string
  remoteUrl?: string
}

type Candidate = {
  filename: string
  filePath: string
  size: number
  modifiedAt: number
}

const MIN_PACKAGE_SIZE = 1024 * 1024

function repositoryRoot() {
  const cwd = process.cwd()
  return path.basename(cwd) === 'frontend' ? path.resolve(cwd, '..') : cwd
}

function releaseDirectory(environmentName: string, fallback: string[]) {
  const configured = process.env[environmentName]?.trim()
  return configured
    ? path.resolve(configured)
    : path.join(repositoryRoot(), ...fallback)
}

function candidates(directory: string, recursive = false): Candidate[] {
  try {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const filePath = path.join(directory, entry.name)

      if (entry.isDirectory()) {
        return recursive ? candidates(filePath, true) : []
      }
      if (!entry.isFile()) return []

      try {
        const stats = statSync(filePath)
        return stats.size >= MIN_PACKAGE_SIZE
          ? [
              {
                filename: entry.name,
                filePath,
                size: stats.size,
                modifiedAt: stats.mtimeMs,
              },
            ]
          : []
      } catch {
        return []
      }
    })
  } catch {
    return []
  }
}

function newestMatch(files: Candidate[], pattern: RegExp) {
  return files
    .filter((file) => pattern.test(file.filename))
    .sort((left, right) => right.modifiedAt - left.modifiedAt)[0]
}

function localPackage(
  platform: AppPlatform,
  format: AppPackageFormat,
  label: string,
  candidate?: Candidate,
): AppPackage | null {
  if (!candidate) return null
  return {
    platform,
    format,
    filename: candidate.filename,
    label,
    size: candidate.size,
    filePath: candidate.filePath,
  }
}

function remotePackage(
  environmentName: string,
  platform: AppPlatform,
  format: AppPackageFormat,
  label: string,
  fallbackFilename: string,
): AppPackage | null {
  const value = process.env[environmentName]?.trim()
  if (!value) return null

  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol)) return null
    const filename = decodeURIComponent(
      url.pathname.split('/').filter(Boolean).at(-1) || fallbackFilename,
    )

    return {
      platform,
      format,
      filename,
      label,
      size: null,
      remoteUrl: url.toString(),
    }
  } catch {
    return null
  }
}

function windowsPackages(): AppPackage[] {
  const remote = remotePackage(
    'REELHOUSE_WINDOWS_DOWNLOAD_URL',
    'windows',
    'setup',
    'Windows installer',
    'Reelhouse-Setup.exe',
  )
  if (remote) return [remote]

  const directory = releaseDirectory('REELHOUSE_DESKTOP_RELEASE_DIR', [
    'clients',
    'desktop',
    'dist',
  ])
  const files = candidates(directory)
  const choices = [
    localPackage(
      'windows',
      'setup',
      'Windows installer',
      newestMatch(files, /^Reelhouse-Setup-.*\.exe$/i),
    ),
    localPackage(
      'windows',
      'portable',
      'Windows portable app',
      newestMatch(files, /^Reelhouse-Portable-.*\.exe$/i),
    ),
    localPackage(
      'windows',
      'zip',
      'Windows portable ZIP',
      newestMatch(files, /^Reelhouse-.*Windows.*\.zip$/i),
    ),
  ]

  return choices.find(Boolean) ? [choices.find(Boolean) as AppPackage] : []
}

function linuxPackages(): AppPackage[] {
  const directory = releaseDirectory('REELHOUSE_DESKTOP_RELEASE_DIR', [
    'clients',
    'desktop',
    'dist',
  ])
  const files = candidates(directory)
  const appImage =
    remotePackage(
      'REELHOUSE_LINUX_APPIMAGE_URL',
      'linux',
      'appimage',
      'Linux AppImage',
      'Reelhouse.AppImage',
    ) ||
    localPackage(
      'linux',
      'appimage',
      'Linux AppImage',
      newestMatch(files, /^Reelhouse-.*\.AppImage$/i),
    )
  const deb =
    remotePackage(
      'REELHOUSE_LINUX_DEB_URL',
      'linux',
      'deb',
      'Ubuntu / Debian package',
      'Reelhouse.deb',
    ) ||
    localPackage(
      'linux',
      'deb',
      'Ubuntu / Debian package',
      newestMatch(files, /^Reelhouse-.*\.deb$/i),
    )

  return [appImage, deb].filter((item): item is AppPackage => Boolean(item))
}

function androidPackages(): AppPackage[] {
  const remote = remotePackage(
    'REELHOUSE_ANDROID_DOWNLOAD_URL',
    'android',
    'apk',
    'Android APK',
    'Reelhouse.apk',
  )
  if (remote) return [remote]

  const directory = releaseDirectory('REELHOUSE_ANDROID_RELEASE_DIR', [
    'clients',
    'android',
    'android',
    'app',
    'build',
    'outputs',
    'apk',
  ])
  const files = candidates(directory, true)
  const release = newestMatch(files, /(?:^|\/)app-release\.apk$/i)
  const debug = newestMatch(files, /(?:^|\/)app-debug\.apk$/i)
  const selected = release || debug || newestMatch(files, /\.apk$/i)
  const app = localPackage('android', 'apk', 'Android APK', selected)

  return app ? [{ ...app, filename: 'Reelhouse-Android.apk' }] : []
}

export function listAppPackages() {
  return {
    windows: windowsPackages(),
    linux: linuxPackages(),
    android: androidPackages(),
  } satisfies Record<AppPlatform, AppPackage[]>
}

export function findAppPackage(
  platform: string,
  requestedFormat?: string | null,
) {
  if (!['windows', 'linux', 'android'].includes(platform)) return null
  const packages = listAppPackages()[platform as AppPlatform]
  return requestedFormat
    ? packages.find((item) => item.format === requestedFormat) || null
    : packages[0] || null
}
