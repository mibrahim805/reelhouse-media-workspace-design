import { fileURLToPath } from 'node:url'

const projectRoot = fileURLToPath(new URL('.', import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  images: {
    unoptimized: true,
  },
  outputFileTracingRoot: projectRoot,
  turbopack: {
    root: projectRoot,
  },
}

export default nextConfig
