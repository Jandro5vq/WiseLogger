/**
 * Running application version, sourced from package.json at build time via
 * next.config.mjs (NEXT_PUBLIC_APP_VERSION). Safe to import on client and server.
 */
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0'
