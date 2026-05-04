export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { scheduleBackup } = await import('@/lib/backup')
    scheduleBackup()

    const { runStartupAutoClose, scheduleAutoClose } = await import('@/lib/business/auto-close')
    runStartupAutoClose()
    scheduleAutoClose()
  }
}
