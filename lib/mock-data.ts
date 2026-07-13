export type Video = {
  id: string
  title: string
  channel: string
  channelInitials: string
  thumbnail: string
  duration: string
  views: string
  published: string
  category: string
  description: string
}

export const CATEGORIES = [
  'All',
  'Development',
  'Travel',
  'Cooking',
  'Music',
  'Gaming',
  'Nature',
  'Fitness',
  'Design',
]

export const QUALITIES = [
  { label: '2160p', note: '4K • Ultra HD', size: '1.8 GB' },
  { label: '1440p', note: '2K • Quad HD', size: '860 MB' },
  { label: '1080p', note: 'Full HD', size: '420 MB' },
  { label: '720p', note: 'HD', size: '210 MB' },
  { label: '480p', note: 'SD', size: '110 MB' },
  { label: 'Audio', note: 'MP3 • 320kbps', size: '9 MB' },
]

export const VIDEOS: Video[] = [
  {
    id: 'v1',
    title: 'Building a Production Next.js App from Scratch in 2026',
    channel: 'Vector Labs',
    channelInitials: 'VL',
    thumbnail: '/thumbnails/tech.png',
    duration: '24:18',
    views: '1.2M views',
    published: '3 days ago',
    category: 'Development',
    description:
      'A complete walkthrough of architecting a modern web application: routing, data fetching, caching, and deployment best practices.',
  },
  {
    id: 'v2',
    title: 'I Spent 48 Hours on the Most Remote Island in the Pacific',
    channel: 'Wanderframe',
    channelInitials: 'WF',
    thumbnail: '/thumbnails/travel.png',
    duration: '18:42',
    views: '3.9M views',
    published: '1 week ago',
    category: 'Travel',
    description:
      'From turquoise lagoons to hidden coastal trails — an unforgettable trip to one of the least-visited places on earth.',
  },
  {
    id: 'v3',
    title: 'The Only Fresh Pasta Guide You Will Ever Need',
    channel: 'Cucina Nera',
    channelInitials: 'CN',
    thumbnail: '/thumbnails/cooking.png',
    duration: '12:05',
    views: '842K views',
    published: '5 days ago',
    category: 'Cooking',
    description:
      'Master the fundamentals of hand-rolled pasta with three classic doughs and two simple sauces anyone can make at home.',
  },
  {
    id: 'v4',
    title: 'Late Night Sessions — Acoustic Guitar Set (Live)',
    channel: 'Ember Room',
    channelInitials: 'ER',
    thumbnail: '/thumbnails/music.png',
    duration: '47:33',
    views: '605K views',
    published: '2 weeks ago',
    category: 'Music',
    description:
      'An intimate live acoustic performance recorded in a single take under warm stage lights. Full setlist in the description.',
  },
  {
    id: 'v5',
    title: 'Ranking Every Sci-Fi World I Explored This Year',
    channel: 'Pixel Drift',
    channelInitials: 'PD',
    thumbnail: '/thumbnails/gaming.png',
    duration: '31:57',
    views: '2.1M views',
    published: '4 days ago',
    category: 'Gaming',
    description:
      'A deep dive into the most atmospheric game environments of the year, ranked by design, immersion, and sound.',
  },
  {
    id: 'v6',
    title: 'Sunrise Above the Clouds — 4K Nature Documentary',
    channel: 'Wild Frame',
    channelInitials: 'WF',
    thumbnail: '/thumbnails/nature.png',
    duration: '52:11',
    views: '4.6M views',
    published: '1 month ago',
    category: 'Nature',
    description:
      'Follow the changing light across misted mountain ranges in this slow, meditative documentary shot entirely at dawn.',
  },
  {
    id: 'v7',
    title: '20-Minute Full Body Workout (No Equipment)',
    channel: 'Foundry Fit',
    channelInitials: 'FF',
    thumbnail: '/thumbnails/fitness.png',
    duration: '20:00',
    views: '1.8M views',
    published: '6 days ago',
    category: 'Fitness',
    description:
      'A follow-along session designed to build strength and mobility at home. Warm-up, circuits, and cooldown included.',
  },
  {
    id: 'v8',
    title: 'Designing Interfaces People Actually Understand',
    channel: 'Grid & Grain',
    channelInitials: 'GG',
    thumbnail: '/thumbnails/design.png',
    duration: '15:29',
    views: '520K views',
    published: '2 days ago',
    category: 'Design',
    description:
      'Practical principles for building clear, usable product interfaces — hierarchy, spacing, color, and motion.',
  },
  {
    id: 'v9',
    title: 'Advanced Caching Patterns Explained Visually',
    channel: 'Vector Labs',
    channelInitials: 'VL',
    thumbnail: '/thumbnails/tech.png',
    duration: '27:44',
    views: '410K views',
    published: '1 week ago',
    category: 'Development',
    description:
      'Understand stale-while-revalidate, cache tags, and invalidation with clear diagrams and real examples.',
  },
  {
    id: 'v10',
    title: 'Street Food Tour — Eating Through Three Cities',
    channel: 'Cucina Nera',
    channelInitials: 'CN',
    thumbnail: '/thumbnails/cooking.png',
    duration: '22:16',
    views: '990K views',
    published: '3 weeks ago',
    category: 'Travel',
    description:
      'A whirlwind tour of the best market stalls and hidden kitchens across three unforgettable food capitals.',
  },
  {
    id: 'v11',
    title: 'Cinematic Lighting for Small Spaces',
    channel: 'Grid & Grain',
    channelInitials: 'GG',
    thumbnail: '/thumbnails/design.png',
    duration: '14:02',
    views: '288K views',
    published: '5 days ago',
    category: 'Design',
    description:
      'Turn any room into a filmable set with a handful of affordable lights and a few simple placement rules.',
  },
  {
    id: 'v12',
    title: 'Deep Focus — Ambient Soundscape for Work',
    channel: 'Ember Room',
    channelInitials: 'ER',
    thumbnail: '/thumbnails/music.png',
    duration: '1:02:40',
    views: '3.3M views',
    published: '2 months ago',
    category: 'Music',
    description:
      'A continuous ambient mix built to keep you in flow. No interruptions, no vocals — just steady momentum.',
  },
]

export function getVideoById(id: string) {
  return VIDEOS.find((v) => v.id === id)
}
