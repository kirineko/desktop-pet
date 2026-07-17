/**
 * 解析 OpenAI 兼容的 SSE 流（data: {...} / data: [DONE]）。
 * 返回增量 content 字符串，忽略 reasoning_content。
 */
export async function* parseSseContentDeltas(
  body: ReadableStream<Uint8Array> | null,
  signal?: AbortSignal
): AsyncGenerator<string, void, unknown> {
  if (!body) return
  const reader = body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''

  try {
    while (true) {
      if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError')
      }
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      let boundary = buffer.indexOf('\n')
      while (boundary >= 0) {
        const line = buffer.slice(0, boundary).replace(/\r$/, '')
        buffer = buffer.slice(boundary + 1)
        const delta = extractDelta(line)
        if (delta != null && delta !== '') {
          yield delta
        }
        boundary = buffer.indexOf('\n')
      }
    }

    const leftover = buffer.trim()
    if (leftover) {
      const delta = extractDelta(leftover)
      if (delta != null && delta !== '') {
        yield delta
      }
    }
  } finally {
    reader.releaseLock()
  }
}

function extractDelta(line: string): string | null {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith(':')) return null
  if (!trimmed.startsWith('data:')) return null
  const data = trimmed.slice(5).trim()
  if (!data || data === '[DONE]') return null
  try {
    const json = JSON.parse(data) as {
      choices?: Array<{
        delta?: { content?: string | null }
        finish_reason?: string | null
      }>
    }
    const content = json.choices?.[0]?.delta?.content
    return typeof content === 'string' ? content : null
  } catch {
    return null
  }
}
