// @ts-check
import withPWA from 'next-pwa'

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  webpack: (config, { isServer }) => {
    if (isServer) {
      // better-sqlite3 is a native addon — must not be bundled by webpack
      const externals = Array.isArray(config.externals) ? config.externals : []
      config.externals = [...externals, 'better-sqlite3']
    }
    return config
  },
}

export default withPWA({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
})(nextConfig)
