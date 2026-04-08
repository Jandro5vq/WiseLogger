import path from 'path'
import fs from 'fs'
import { env } from '@/lib/env'
import { sqlite } from '@/lib/db'

export function performBackup(): void {
  const backupDir = env.BACKUP_PATH
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true })
  }

  const date = new Date().toISOString().split('T')[0]
  const backupPath = path.join(backupDir, `wiselogger-${date}.db`)

  // VACUUM INTO creates a clean single-file backup (handles WAL correctly)
  sqlite.prepare(`VACUUM INTO ?`).run(backupPath)
  console.log(`[backup] Created backup: ${backupPath}`)
}

export function scheduleBackup(): void {
  if (!env.BACKUP_CRON) return

  // Dynamic import of node-cron to avoid issues in edge environments
  import('node-cron')
    .then((cron) => {
      cron.schedule(env.BACKUP_CRON, () => {
        try {
          performBackup()
        } catch (err) {
          console.error('[backup] Backup failed:', err)
        }
      })
      console.log(`[backup] Scheduled with cron: ${env.BACKUP_CRON}`)
    })
    .catch((err) => {
      console.error('[backup] Failed to load node-cron:', err)
    })
}
