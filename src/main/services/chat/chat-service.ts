import { randomUUID } from 'crypto'
import type {
  ChatErrorCode,
  ChatStreamEvent,
  SendChatMessageInput
} from '../../../shared/types'
import {
  createConversation,
  deleteConversation,
  getConversation,
  getConversationMessages,
  getPersonaProfile,
  getRecentContextMessages,
  insertMessage,
  listConversations,
  renameConversation,
  updateMessage,
  updatePersonaProfile
} from './chat-db'
import {
  DeepSeekApiError,
  streamChatCompletion,
  testApiKeyConnection,
  type DeepSeekChatMessage
} from './deepseek-client'
import { buildSystemPrompt } from './prompt-builder'
import {
  clearApiKey,
  getApiKey,
  getApiKeyStatus,
  setApiKey,
  validateApiKeyFormat
} from './secrets-store'

type StreamListener = (event: ChatStreamEvent) => void

const activeControllers = new Map<string, AbortController>()
const listeners = new Set<StreamListener>()

function emit(event: ChatStreamEvent): void {
  for (const listener of listeners) {
    try {
      listener(event)
    } catch {
      // 忽略订阅方异常，避免打断生成
    }
  }
}

export function onChatStream(listener: StreamListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function chatGetApiKeyStatus() {
  return getApiKeyStatus()
}

export function chatSetApiKey(apiKey: string) {
  return setApiKey(apiKey)
}

export function chatClearApiKey() {
  return clearApiKey()
}

export async function chatTestApiKey(apiKey?: string) {
  const key =
    apiKey != null && apiKey.trim()
      ? validateApiKeyFormat(apiKey)
      : getApiKey()
  if (!key) {
    return { ok: false, message: '尚未配置 API Key' }
  }
  return testApiKeyConnection(key)
}

export function chatGetPersonaProfile(petId: Parameters<typeof getPersonaProfile>[0]) {
  return getPersonaProfile(petId)
}

export function chatUpdatePersonaProfile(
  ...args: Parameters<typeof updatePersonaProfile>
) {
  return updatePersonaProfile(...args)
}

export function chatListConversations(
  ...args: Parameters<typeof listConversations>
) {
  return listConversations(...args)
}

export function chatCreateConversation(
  ...args: Parameters<typeof createConversation>
) {
  return createConversation(...args)
}

export function chatRenameConversation(
  ...args: Parameters<typeof renameConversation>
) {
  return renameConversation(...args)
}

export function chatDeleteConversation(conversationId: string) {
  stopChatGeneration(conversationId)
  return { ok: deleteConversation(conversationId) }
}

export function chatGetMessages(conversationId: string) {
  return getConversationMessages(conversationId)
}

export function stopChatGeneration(conversationId?: string): { ok: boolean } {
  if (conversationId) {
    const controller = activeControllers.get(conversationId)
    if (controller) {
      controller.abort()
      activeControllers.delete(conversationId)
      return { ok: true }
    }
    return { ok: false }
  }
  for (const [id, controller] of activeControllers) {
    controller.abort()
    activeControllers.delete(id)
  }
  return { ok: true }
}

export async function sendChatMessage(
  input: SendChatMessageInput
): Promise<{ ok: boolean; error?: string; code?: ChatErrorCode }> {
  const content =
    typeof input.content === 'string' ? input.content.trim() : ''
  if (!content) {
    return { ok: false, error: '消息不能为空', code: 'unknown' }
  }
  if (content.length > 4000) {
    return { ok: false, error: '消息过长（最多 4000 字）', code: 'unknown' }
  }

  const conversation = getConversation(input.conversationId)
  if (!conversation) {
    return { ok: false, error: '会话不存在', code: 'unknown' }
  }

  if (activeControllers.has(conversation.id)) {
    return { ok: false, error: '正在生成中，请先停止', code: 'unknown' }
  }

  let apiKey: string | null
  try {
    apiKey = getApiKey()
  } catch {
    return {
      ok: false,
      error: '系统加密不可用，无法读取 API Key',
      code: 'missing_api_key'
    }
  }
  if (!apiKey) {
    return {
      ok: false,
      error: '请先在设置中配置 DeepSeek API Key',
      code: 'missing_api_key'
    }
  }

  const userMessage = insertMessage({
    conversationId: conversation.id,
    role: 'user',
    content,
    status: 'complete'
  })
  const assistantMessageId = randomUUID()
  insertMessage({
    id: assistantMessageId,
    conversationId: conversation.id,
    role: 'assistant',
    content: '',
    status: 'streaming'
  })

  emit({
    type: 'start',
    conversationId: conversation.id,
    userMessageId: userMessage.id,
    assistantMessageId
  })

  const controller = new AbortController()
  activeControllers.set(conversation.id, controller)

  const profile = getPersonaProfile(conversation.petId)
  const systemPrompt = buildSystemPrompt(conversation.petId, profile)
  const history = getRecentContextMessages(conversation.id, 24)
  const messages: DeepSeekChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...history
      .filter((m) => m.id !== assistantMessageId)
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content
      }))
  ]

  let assembled = ''
  try {
    assembled = await streamChatCompletion({
      apiKey,
      messages,
      signal: controller.signal,
      onDelta: (delta) => {
        assembled += delta
        updateMessage(assistantMessageId, {
          content: assembled,
          status: 'streaming'
        })
        emit({
          type: 'delta',
          conversationId: conversation.id,
          assistantMessageId,
          delta
        })
      }
    })

    updateMessage(assistantMessageId, {
      content: assembled,
      status: 'complete',
      errorCode: null
    })
    emit({
      type: 'done',
      conversationId: conversation.id,
      assistantMessageId,
      content: assembled
    })
    return { ok: true }
  } catch (error) {
    const mapped = mapError(error)
    if (mapped.code === 'aborted') {
      updateMessage(assistantMessageId, {
        content: assembled,
        status: 'cancelled',
        errorCode: 'aborted'
      })
      emit({
        type: 'cancelled',
        conversationId: conversation.id,
        assistantMessageId
      })
      return { ok: false, error: mapped.message, code: mapped.code }
    }

    updateMessage(assistantMessageId, {
      content: assembled || mapped.message,
      status: 'error',
      errorCode: mapped.code
    })
    emit({
      type: 'error',
      conversationId: conversation.id,
      assistantMessageId,
      code: mapped.code,
      message: mapped.message
    })
    return { ok: false, error: mapped.message, code: mapped.code }
  } finally {
    activeControllers.delete(conversation.id)
  }
}

function mapError(error: unknown): { code: ChatErrorCode; message: string } {
  if (error instanceof DeepSeekApiError) {
    return { code: error.code, message: error.message }
  }
  if (error instanceof Error && error.name === 'AbortError') {
    return { code: 'aborted', message: '已停止生成' }
  }
  return { code: 'unknown', message: '生成失败，请稍后重试' }
}

export function disposeChatService(): void {
  stopChatGeneration()
  listeners.clear()
}
