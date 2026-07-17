import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import type { DesktopPetApi } from './types'

describe('chat api contract', () => {
  it('does not expose plaintext api key getters on DesktopPetApi', () => {
    const apiKeys = [
      'getApiKeyStatus',
      'setApiKey',
      'clearApiKey',
      'testApiKey',
      'openChat',
      'getChatOpenOptions',
      'sendChatMessage',
      'stopChatGeneration'
    ] as const satisfies ReadonlyArray<keyof DesktopPetApi>

    expect(apiKeys).toContain('getApiKeyStatus')
    expect(
      (apiKeys as readonly string[]).includes('getApiKey')
    ).toBe(false)

    const preload = readFileSync(
      join(__dirname, '../preload/index.ts'),
      'utf8'
    )
    expect(preload).toContain('getApiKeyStatus')
    expect(preload).not.toMatch(/getApiKey\s*:/)
    expect(preload).not.toContain("invoke('get-api-key'")
  })
})
