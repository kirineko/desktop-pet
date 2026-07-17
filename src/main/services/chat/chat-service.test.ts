import { afterEach, describe, expect, it, vi } from 'vitest'

const {
  getConversationMock,
  insertMessageMock,
  updateMessageMock,
  getPersonaProfileMock,
  getRecentContextMessagesMock,
  getApiKeyMock,
  streamChatCompletionMock
} = vi.hoisted(() => ({
  getConversationMock: vi.fn(),
  insertMessageMock: vi.fn(),
  updateMessageMock: vi.fn(),
  getPersonaProfileMock: vi.fn(),
  getRecentContextMessagesMock: vi.fn(),
  getApiKeyMock: vi.fn(),
  streamChatCompletionMock: vi.fn()
}))

vi.mock('./chat-db', () => ({
  getConversation: getConversationMock,
  insertMessage: insertMessageMock,
  updateMessage: updateMessageMock,
  getPersonaProfile: getPersonaProfileMock,
  getRecentContextMessages: getRecentContextMessagesMock,
  createConversation: vi.fn(),
  deleteConversation: vi.fn(),
  listConversations: vi.fn(),
  renameConversation: vi.fn(),
  getConversationMessages: vi.fn(),
  updatePersonaProfile: vi.fn()
}))

vi.mock('./secrets-store', () => ({
  getApiKey: getApiKeyMock,
  getApiKeyStatus: vi.fn(() => ({
    configured: true,
    masked: 'sk-…test',
    encryptionAvailable: true
  })),
  setApiKey: vi.fn(),
  clearApiKey: vi.fn(),
  validateApiKeyFormat: (v: string) => v.trim()
}))

vi.mock('./deepseek-client', async () => {
  const actual = await vi.importActual<typeof import('./deepseek-client')>(
    './deepseek-client'
  )
  return {
    ...actual,
    streamChatCompletion: streamChatCompletionMock,
    testApiKeyConnection: vi.fn()
  }
})

vi.mock('./prompt-builder', () => ({
  buildSystemPrompt: () => 'SYSTEM'
}))

import {
  disposeChatService,
  onChatStream,
  sendChatMessage,
  stopChatGeneration
} from './chat-service'

describe('chat-service', () => {
  afterEach(() => {
    disposeChatService()
    vi.clearAllMocks()
  })

  it('streams a reply and emits events without returning the api key', async () => {
    getConversationMock.mockReturnValue({
      id: 'c1',
      petId: 'doro',
      title: 't',
      createdAt: 1,
      updatedAt: 1,
      lastMessagePreview: null
    })
    getApiKeyMock.mockReturnValue('sk-secret-should-not-leak')
    getPersonaProfileMock.mockReturnValue({
      petId: 'doro',
      userCallName: '主人',
      relationship: '伙伴',
      personalityBias: 'caring',
      tonePreference: 'gentle',
      extraNotes: '',
      updatedAt: 1
    })
    getRecentContextMessagesMock.mockReturnValue([
      {
        id: 'u1',
        conversationId: 'c1',
        role: 'user',
        content: '你好',
        createdAt: 1,
        status: 'complete'
      }
    ])
    insertMessageMock.mockImplementation(
      (input: { id?: string; role: string; content: string }) => ({
        id: input.id ?? 'u1',
        conversationId: 'c1',
        role: input.role,
        content: input.content,
        createdAt: Date.now(),
        status: input.id ? 'streaming' : 'complete'
      })
    )

    streamChatCompletionMock.mockImplementation(
      async (options: {
        onDelta?: (d: string) => void
        apiKey: string
      }) => {
        expect(options.apiKey).toBe('sk-secret-should-not-leak')
        options.onDelta?.('嘿')
        options.onDelta?.('嘿')
        return '嘿嘿'
      }
    )

    const events: string[] = []
    onChatStream((event) => {
      events.push(event.type)
      expect(JSON.stringify(event)).not.toContain('sk-secret')
    })

    const result = await sendChatMessage({
      conversationId: 'c1',
      content: '你好'
    })
    expect(result.ok).toBe(true)
    expect(events).toEqual(['start', 'delta', 'delta', 'done'])
    expect(updateMessageMock).toHaveBeenCalled()
  })

  it('rejects when api key is missing', async () => {
    getConversationMock.mockReturnValue({
      id: 'c1',
      petId: 'doro',
      title: 't',
      createdAt: 1,
      updatedAt: 1,
      lastMessagePreview: null
    })
    getApiKeyMock.mockReturnValue(null)
    const result = await sendChatMessage({
      conversationId: 'c1',
      content: 'hi'
    })
    expect(result.ok).toBe(false)
    expect(result.code).toBe('missing_api_key')
  })

  it('can stop generation', async () => {
    expect(stopChatGeneration().ok).toBe(true)
  })
})
