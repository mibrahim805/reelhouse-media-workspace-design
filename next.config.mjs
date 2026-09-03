import { fileURLToPath } from 'node:url'

const projectRoot = fileURLToPath(new URL('.', import.meta.url))
const isExport = process.env.OUTPUT_MODE === 'export'

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: isExport ? 'export' : 'standalone',
  images: {
    unoptimized: true,
  },
  outputFileTracingRoot: projectRoot,
  turbopack: {
    root: projectRoot,
  },
}

export default nextConfig
