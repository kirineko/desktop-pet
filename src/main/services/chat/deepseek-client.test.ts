import { describe, expect, it, vi } from 'vitest'
import {
  DEEPSEEK_MODEL,
  DeepSeekApiError,
  buildChatCompletionBody,
  streamChatCompletion
} from './deepseek-client'

describe('deepseek-client', () => {
  it('builds non-thinking flash request body', () => {
    const body = buildChatCompletionBody([
      { role: 'user', content: 'hi' }
    ])
    expect(body).toEqual({
      model: DEEPSEEK_MODEL,
      messages: [{ role: 'user', content: 'hi' }],
      stream: true,
      thinking: { type: 'disabled' }
    })
  })

  it('streams deltas and sends bearer auth without leaking key in body', async () => {
    const deltas: string[] = []
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const parsed = JSON.parse(String(init?.body))
      expect(parsed.model).toBe('deepseek-v4-flash')
      expect(parsed.thinking).toEqual({ type: 'disabled' })
      expect(JSON.stringify(parsed)).not.toContain('sk-secret')
      const headers = init?.headers as Record<string, string>
      expect(headers.Authorization).toBe('Bearer sk-secret')

      const encoder = new TextEncoder()
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              'data: {"choices":[{"delta":{"content":"嘿"}}]}\n\n'
            )
          )
          controller.enqueue(
            encoder.encode(
              'data: {"choices":[{"delta":{"content":"嘿"}}]}\n\ndata: [DONE]\n\n'
            )
          )
          controller.close()
        }
      })
      return new Response(stream, { status: 200 })
    })

    const full = await streamChatCompletion({
      apiKey: 'sk-secret',
      messages: [{ role: 'user', content: 'hi' }],
      fetchImpl: fetchImpl as unknown as typeof fetch,
      onDelta: (d) => deltas.push(d)
    })
    expect(full).toBe('嘿嘿')
    expect(deltas.join('')).toBe('嘿嘿')
  })

  it('maps 401 to invalid_api_key', async () => {
    const fetchImpl = vi.fn(async () => new Response('unauthorized', { status: 401 }))
    await expect(
      streamChatCompletion({
        apiKey: 'bad',
        messages: [{ role: 'user', content: 'hi' }],
        fetchImpl: fetchImpl as unknown as typeof fetch
      })
    ).rejects.toMatchObject({
      name: 'DeepSeekApiError',
      code: 'invalid_api_key'
    } satisfies Partial<DeepSeekApiError>)
  })
})
