#!/usr/bin/env node
'use strict'

const { execSync, spawn } = require('child_process')
const path = require('path')

function run(script) {
  console.log(`[start] Running ${script}...`)
  execSync(`node ${path.join(__dirname, script)}`, {
    stdio: 'inherit',
    env: process.env,
  })
}

// Eagerly validate required env vars before touching the database
if (!process.env.SECRET_KEY || process.env.SECRET_KEY.length < 32) {
  console.error('[start] FATAL: SECRET_KEY is missing or shorter than 32 characters')
  process.exit(1)
}
if (!process.env.ADMIN_EMAIL) {
  console.error('[start] FATAL: ADMIN_EMAIL is not set')
  process.exit(1)
}

try {
  run('migrate.js')
  run('seed-admin.js')
  run('seed-demo.js')
} catch (err) {
  console.error('[start] Startup failed:', err.message)
  process.exit(1)
}

console.log('[start] Starting Next.js server...')
const server = spawn('node', [path.join(__dirname, '..', 'server.js')], {
  stdio: 'inherit',
  env: process.env,
})

server.on('exit', (code) => {
  process.exit(code ?? 0)
})
