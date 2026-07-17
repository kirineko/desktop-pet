import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

let exitCode = 1

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: process.env,
    ...options
  })
  if (result.error) throw result.error
  return result.status ?? 1
}

/** Windows 上直接 spawnSync('npm.cmd') 会 EINVAL；优先走 npm_execpath。 */
function runNpm(args) {
  const npmCli = process.env.npm_execpath
  if (npmCli) {
    return run(process.execPath, [npmCli, ...args])
  }
  return run(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, {
    shell: process.platform === 'win32'
  })
}

try {
  const rebuildForNode = runNpm(['rebuild', 'better-sqlite3'])
  if (rebuildForNode !== 0) {
    exitCode = rebuildForNode
  } else {
    exitCode = run(process.execPath, [
      join(process.cwd(), 'node_modules/vitest/vitest.mjs'),
      'run'
    ])
  }
} finally {
  const restoreForElectron = runNpm(['run', 'rebuild:native'])
  if (restoreForElectron !== 0 && exitCode === 0) {
    exitCode = restoreForElectron
  }
}

process.exitCode = exitCode
