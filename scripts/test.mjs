import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
let exitCode = 1

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    stdio: 'inherit'
  })
  if (result.error) throw result.error
  return result.status ?? 1
}

try {
  const rebuildForNode = run(npm, ['rebuild', 'better-sqlite3'])
  if (rebuildForNode !== 0) {
    exitCode = rebuildForNode
  } else {
    exitCode = run(process.execPath, [
      join(process.cwd(), 'node_modules/vitest/vitest.mjs'),
      'run'
    ])
  }
} finally {
  const restoreForElectron = run(npm, ['run', 'rebuild:native'])
  if (restoreForElectron !== 0 && exitCode === 0) {
    exitCode = restoreForElectron
  }
}

process.exitCode = exitCode
