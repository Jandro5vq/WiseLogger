function get(name: string): string {
  return process.env[name] ?? ''
}

function optional(name: string, defaultValue: string): string {
  return process.env[name] || defaultValue
}

// Lazy validation — throws at runtime on first access, not at build time
export const env = {
  get SECRET_KEY() {
    const v = get('SECRET_KEY')
    if (!v) throw new Error('Missing required environment variable: SECRET_KEY')
    if (v.length < 32) throw new Error('SECRET_KEY must be at least 32 characters long')
    return v
  },
  get ADMIN_EMAIL() {
    const v = get('ADMIN_EMAIL')
    if (!v) throw new Error('Missing required environment variable: ADMIN_EMAIL')
    return v
  },
  get BASE_URL() { return optional('BASE_URL', 'http://localhost:3000') },
  get DB_PATH() { return optional('DB_PATH', './data/wiselogger.db') },
  get PORT() { return parseInt(optional('PORT', '3000'), 10) },
  get INVITATION_EXPIRY_HOURS() { return parseInt(optional('INVITATION_EXPIRY_HOURS', '72'), 10) },
  get BACKUP_CRON() { return optional('BACKUP_CRON', '0 2 * * *') },
  get BACKUP_PATH() { return optional('BACKUP_PATH', '/data/backups') },
  get AUTO_CLOSE_CRON() { return optional('AUTO_CLOSE_CRON', '55 23 * * *') },
  get NODE_ENV() { return optional('NODE_ENV', 'development') },
} as const
