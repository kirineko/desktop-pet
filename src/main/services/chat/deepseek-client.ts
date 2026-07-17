import type { ChatErrorCode, ChatMessageRole } from '../../../shared/types'
import { parseSseContentDeltas } from './sse'

export const DEEPSEEK_BASE_URL = 'https://api.deepseek.com'
export const DEEPSEEK_MODEL = 'deepseek-v4-flash'

export interface DeepSeekChatMessage {
  role: ChatMessageRole
  content: string
}

export interface DeepSeekStreamOptions {
  apiKey: string
  messages: DeepSeekChatMessage[]
  signal?: AbortSignal
  fetchImpl?: typeof fetch
  onDelta?: (delta: string) => void
}

export class DeepSeekApiError extends Error {
  readonly code: ChatErrorCode
  readonly status?: number

  constructor(code: ChatErrorCode, message: string, status?: number) {
    super(message)
    this.name = 'DeepSeekApiError'
    this.code = code
    this.status = status
  }
}

export function buildChatCompletionBody(
  messages: DeepSeekChatMessage[]
): Record<string, unknown> {
  return {
    model: DEEPSEEK_MODEL,
    messages,
    stream: true,
    thinking: { type: 'disabled' }
  }
}

function mapHttpError(status: number, bodyText: string): DeepSeekApiError {
  if (status === 401 || status === 403) {
    return new DeepSeekApiError(
      'invalid_api_key',
      'API Key 无效或已失效，请重新配置',
      status
    )
  }
  if (status === 429) {
    return new DeepSeekApiError(
      'rate_limited',
      '请求过于频繁，请稍后再试',
      status
    )
  }
  if (bodyText.includes('content_filter')) {
    return new DeepSeekApiError(
      'content_filter',
      '回复被内容安全策略过滤',
      status
    )
  }
  if (bodyText.includes('insufficient_system_resource')) {
    return new DeepSeekApiError(
      'insufficient_resource',
      '模型服务资源不足，请稍后重试',
      status
    )
  }
  return new DeepSeekApiError(
    'unknown',
    `DeepSeek 请求失败（${status}）`,
    status
  )
}

export async function streamChatCompletion(
  options: DeepSeekStreamOptions
): Promise<string> {
  const fetchImpl = options.fetchImpl ?? fetch
  const body = buildChatCompletionBody(options.messages)

  let response: Response
  try {
    response = await fetchImpl(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${options.apiKey}`
      },
      body: JSON.stringify(body),
      signal: options.signal
    })
  } catch (error) {
    if (
      options.signal?.aborted ||
      (error instanceof Error && error.name === 'AbortError')
    ) {
      throw new DeepSeekApiError('aborted', '已停止生成')
    }
    throw new DeepSeekApiError('network', '网络连接失败，请检查网络后重试')
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw mapHttpError(response.status, text)
  }

  let full = ''
  try {
    for await (const delta of parseSseContentDeltas(
      response.body,
      options.signal
    )) {
      full += delta
      options.onDelta?.(delta)
    }
  } catch (error) {
    if (
      options.signal?.aborted ||
      (error instanceof Error && error.name === 'AbortError')
    ) {
      throw new DeepSeekApiError('aborted', '已停止生成')
    }
    if (error instanceof DeepSeekApiError) throw error
    throw new DeepSeekApiError('network', '读取回复时中断，请重试')
  }

  return full
}

/** 用极短非流式请求验证 Key（仅主进程）。 */
export async function testApiKeyConnection(
  apiKey: string,
  fetchImpl: typeof fetch = fetch
): Promise<{ ok: boolean; message: string }> {
  try {
    const response = await fetchImpl(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: [{ role: 'user', content: 'ping' }],
        stream: false,
        thinking: { type: 'disabled' },
        max_tokens: 1
      })
    })
    if (response.ok) {
      return { ok: true, message: '连接成功' }
    }
    const err = mapHttpError(
      response.status,
      await response.text().catch(() => '')
    )
    return { ok: false, message: err.message }
  } catch {
    return { ok: false, message: '网络连接失败，请检查网络后重试' }
  }
}
