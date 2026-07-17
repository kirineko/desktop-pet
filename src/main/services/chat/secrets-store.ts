import { app, safeStorage } from 'electron'
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { ApiKeyStatus } from '../../../shared/types'

const SECRETS_FILENAME = 'deepseek-api-key.bin'

export interface SecretsStoreDeps {
  userDataPath?: string
  isEncryptionAvailable?: () => boolean
  encryptString?: (plain: string) => Buffer
  decryptString?: (encrypted: Buffer) => string
}

function resolvePath(userDataPath?: string): string {
  const base = userDataPath ?? app.getPath('userData')
  return join(base, SECRETS_FILENAME)
}

function encryptionAvailable(deps: SecretsStoreDeps): boolean {
  if (deps.isEncryptionAvailable) return deps.isEncryptionAvailable()
  return safeStorage.isEncryptionAvailable()
}

function encrypt(plain: string, deps: SecretsStoreDeps): Buffer {
  if (deps.encryptString) return deps.encryptString(plain)
  return safeStorage.encryptString(plain)
}

function decrypt(encrypted: Buffer, deps: SecretsStoreDeps): string {
  if (deps.decryptString) return deps.decryptString(encrypted)
  return safeStorage.decryptString(encrypted)
}

export function maskApiKey(apiKey: string): string {
  const trimmed = apiKey.trim()
  if (trimmed.length <= 8) return '••••••••'
  return `${trimmed.slice(0, 3)}…${trimmed.slice(-4)}`
}

export function validateApiKeyFormat(apiKey: unknown): string {
  if (typeof apiKey !== 'string') {
    throw new Error('API Key 必须是字符串')
  }
  const trimmed = apiKey.trim()
  if (!trimmed) {
    throw new Error('API Key 不能为空')
  }
  if (trimmed.length > 256) {
    throw new Error('API Key 过长')
  }
  if (/\s/.test(trimmed)) {
    throw new Error('API Key 不能包含空白字符')
  }
  return trimmed
}

export function getApiKeyStatus(deps: SecretsStoreDeps = {}): ApiKeyStatus {
  const available = encryptionAvailable(deps)
  const path = resolvePath(deps.userDataPath)
  if (!existsSync(path)) {
    return {
      configured: false,
      masked: null,
      encryptionAvailable: available
    }
  }
  try {
    const key = getApiKey(deps)
    if (!key) {
      return {
        configured: false,
        masked: null,
        encryptionAvailable: available
      }
    }
    return {
      configured: true,
      masked: maskApiKey(key),
      encryptionAvailable: available
    }
  } catch {
    return {
      configured: false,
      masked: null,
      encryptionAvailable: available
    }
  }
}

/** 仅主进程内部调用，切勿经 IPC 返回。 */
export function getApiKey(deps: SecretsStoreDeps = {}): string | null {
  const path = resolvePath(deps.userDataPath)
  if (!existsSync(path)) return null
  if (!encryptionAvailable(deps)) {
    throw new Error('系统加密不可用，无法读取 API Key')
  }
  const encrypted = readFileSync(path)
  if (encrypted.length === 0) return null
  const plain = decrypt(encrypted, deps).trim()
  return plain || null
}

export function setApiKey(
  apiKey: string,
  deps: SecretsStoreDeps = {}
): ApiKeyStatus {
  const trimmed = validateApiKeyFormat(apiKey)
  if (!encryptionAvailable(deps)) {
    throw new Error('系统加密不可用，拒绝以明文保存 API Key')
  }
  const encrypted = encrypt(trimmed, deps)
  writeFileSync(resolvePath(deps.userDataPath), encrypted)
  return getApiKeyStatus(deps)
}

export function clearApiKey(deps: SecretsStoreDeps = {}): ApiKeyStatus {
  const path = resolvePath(deps.userDataPath)
  if (existsSync(path)) {
    unlinkSync(path)
  }
  return getApiKeyStatus(deps)
}
