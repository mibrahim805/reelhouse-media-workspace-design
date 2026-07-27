import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Reelhouse Video Downloader',
    short_name: 'Reelhouse',
    description: 'Search YouTube and download videos from the Reelhouse app.',
    start_url: '/',
    display: 'standalone',
    background_color: '#18181b',
    theme_color: '#2b2b30',
    orientation: 'portrait-primary',
    icons: [
      {
        src: '/apple-icon.png',
        sizes: '180x180',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  }
}
