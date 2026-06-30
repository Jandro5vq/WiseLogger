// @ts-check
import withPWA from 'next-pwa'
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

/**
 * The app version shown in the UI is the git tag on the current commit of main.
 * Releases are always tagged on main (see AGENTS.md), so `git describe` resolves to
 * that tag. Resolution priority:
 *   1. APP_VERSION env — explicit override. Required inside Docker, where `.git` is
 *      excluded from the build context (see .dockerignore), so CI passes it as a
 *      build arg: --build-arg APP_VERSION=$(git describe --tags).
 *   2. `git describe --tags` — the tag (or tag-N-gHASH between releases) for local builds.
 *   3. `v<package.json version>` — last-resort fallback if git is unavailable and no tags exist.
 */
function resolveAppVersion() {
  if (process.env.APP_VERSION) return process.env.APP_VERSION
  try {
    return execSync('git describe --tags --always --dirty', {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim()
  } catch {
    return `v${pkg.version}`
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Exposed to the client so the UI can display the running app version.
  env: {
    NEXT_PUBLIC_APP_VERSION: resolveAppVersion(),
  },
  experimental: {
    instrumentationHook: true,
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // better-sqlite3 is a native addon — must not be bundled by webpack
      const externals = Array.isArray(config.externals) ? config.externals : []
      config.externals = [...externals, 'better-sqlite3']
    }
    return config
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ]
  },
}

export default withPWA({
  dest: 'public',
  register: true,
  skipWaiting: false,
  disable: process.env.NODE_ENV === 'development',
})(nextConfig)
