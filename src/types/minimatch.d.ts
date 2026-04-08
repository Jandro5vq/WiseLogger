// Suppress missing types for old minimatch package from next-pwa
declare module 'minimatch' {
  const minimatch: (path: string, pattern: string, options?: object) => boolean
  export = minimatch
}
