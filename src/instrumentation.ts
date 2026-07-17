export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { scheduleBackup } = await import('@/lib/backup')
    scheduleBackup()

    const { runStartupBreakNormalization } = await import('@/lib/business/normalize-breaks')
    runStartupBreakNormalization()

    const { runStartupOverlapSweep } = await import('@/lib/business/overlaps')
    runStartupOverlapSweep()

    const { runStartupAutoClose, scheduleAutoClose } = await import('@/lib/business/auto-close')
    runStartupAutoClose()
    scheduleAutoClose()
  }
}
