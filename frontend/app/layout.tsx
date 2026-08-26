import type { Metadata, Viewport } from 'next'
import { DownloadProvider } from '@/components/download-store'
import { AppShell } from '@/components/app-shell'
import { ServiceWorkerRegistration } from '@/components/service-worker-registration'
import './globals.css'

export const metadata: Metadata = {
  title: 'Reelhouse — Media Workspace',
  description:
    'Search, watch, and download videos in one focused media workspace. YouTube workspace, direct link downloader, and a persistent download manager.',
  generator: 'v0.app',
  icons: {
    apple: '/apple-icon.png',
  },
  appleWebApp: {
    capable: true,
    title: 'Reelhouse',
    statusBarStyle: 'black-translucent',
  },
}

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#f5f5f5',
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="bg-background">
      <body className="font-sans antialiased">
        <DownloadProvider>
          <AppShell>{children}</AppShell>
        </DownloadProvider>
        <ServiceWorkerRegistration />
      </body>
    </html>
  )
}
