import { describe, expect, it } from 'vitest'
import { parseSseContentDeltas } from './sse'

function streamFrom(text: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text))
      controller.close()
    }
  })
}

describe('parseSseContentDeltas', () => {
  it('yields content deltas and ignores done / reasoning', async () => {
    const body = streamFrom(
      [
        'data: {"choices":[{"delta":{"content":"你"}}]}',
        'data: {"choices":[{"delta":{"content":"好","reasoning_content":"think"}}]}',
        'data: [DONE]',
        ''
      ].join('\n')
    )
    const chunks: string[] = []
    for await (const delta of parseSseContentDeltas(body)) {
      chunks.push(delta)
    }
    expect(chunks.join('')).toBe('你好')
  })
})
