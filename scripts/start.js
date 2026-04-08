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

try {
  run('migrate.js')
  run('seed-admin.js')
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
