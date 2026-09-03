import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { DownloadProvider } from '@/components/download-store'
import { AppShell } from '@/components/app-shell'
import { MediaProvider } from '@/components/media-state'
import { MiniPlayer } from '@/components/player/mini-player'
import { LibraryProvider } from '@/components/library-store'
import { ThemeProvider } from '@/components/theme-provider'
import { OfflineRuntime } from '@/components/offline-runtime'
import { OfflineBanner } from '@/components/offline-banner'
import { AppUpdatePrompt } from '@/components/app-update-prompt'
import { APP_BRAND } from '@/lib/app-brand'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: `${APP_BRAND.name} — Your Media, Anywhere`,
  description: 'Search, watch, and download videos in one focused media workspace. YouTube search, direct link downloader, and a persistent download manager.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: APP_BRAND.name,
  },
}

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#090909',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`bg-[#090909] ${inter.variable}`}>
      <body className="font-sans antialiased">
        <ThemeProvider>
          <OfflineRuntime />
          <OfflineBanner />
          <AppUpdatePrompt />
          <DownloadProvider>
            <LibraryProvider>
              <MediaProvider>
                <AppShell>{children}</AppShell>
                <MiniPlayer />
              </MediaProvider>
            </LibraryProvider>
          </DownloadProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
