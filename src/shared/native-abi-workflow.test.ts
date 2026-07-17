import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

describe('native ABI workflow', () => {
  it('always restores better-sqlite3 for Electron after Node tests', () => {
    const root = join(__dirname, '../..')
    const pkg = JSON.parse(
      readFileSync(join(root, 'package.json'), 'utf8')
    ) as { scripts: Record<string, string> }

    expect(pkg.scripts.pretest).toBeUndefined()
    expect(pkg.scripts.test).toBe('node scripts/test.mjs')
    expect(pkg.scripts['rebuild:native']).toBe(
      'electron-rebuild -f -w better-sqlite3'
    )
    expect(pkg.scripts.postinstall).toBe('npm run rebuild:native || true')

    const runner = readFileSync(join(root, 'scripts/test.mjs'), 'utf8')
    expect(runner).toContain('finally')
    expect(runner).toContain('rebuild:native')
  })
})
