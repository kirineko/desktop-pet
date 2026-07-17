import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  clearApiKey,
  getApiKey,
  getApiKeyStatus,
  maskApiKey,
  setApiKey,
  validateApiKeyFormat
} from './secrets-store'

describe('secrets-store', () => {
  let dir: string

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  function setup(available = true) {
    dir = mkdtempSync(join(tmpdir(), 'secrets-'))
    const store = new Map<string, Buffer>()
    return {
      userDataPath: dir,
      isEncryptionAvailable: () => available,
      encryptString: (plain: string) => {
        const buf = Buffer.from(`enc:${plain}`, 'utf8')
        store.set('last', buf)
        return buf
      },
      decryptString: (encrypted: Buffer) => {
        const text = encrypted.toString('utf8')
        if (!text.startsWith('enc:')) throw new Error('bad')
        return text.slice(4)
      }
    }
  }

  it('masks api keys', () => {
    expect(maskApiKey('sk-abcdefghijklmnop')).toBe('sk-…mnop')
  })

  it('validates api key format', () => {
    expect(() => validateApiKeyFormat('')).toThrow('不能为空')
    expect(() => validateApiKeyFormat('sk bad')).toThrow('空白')
    expect(validateApiKeyFormat('  sk-ok  ')).toBe('sk-ok')
  })

  it('round-trips encrypted key and never exposes plaintext via status', () => {
    const deps = setup(true)
    expect(getApiKeyStatus(deps).configured).toBe(false)
    const status = setApiKey('sk-test-secret-key-1234', deps)
    expect(status.configured).toBe(true)
    expect(status.masked).toBe('sk-…1234')
    expect(status.masked).not.toContain('secret')
    expect(getApiKey(deps)).toBe('sk-test-secret-key-1234')
    clearApiKey(deps)
    expect(getApiKeyStatus(deps).configured).toBe(false)
    expect(getApiKey(deps)).toBeNull()
  })

  it('refuses to store when encryption is unavailable', () => {
    const deps = setup(false)
    expect(() => setApiKey('sk-test', deps)).toThrow('系统加密不可用')
  })
})
