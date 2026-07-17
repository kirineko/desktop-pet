// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { renderChatMarkdown } from './chat-markdown'

describe('renderChatMarkdown', () => {
  it('renders common markdown used by model replies', () => {
    const html = renderChatMarkdown(
      '**重点**\n\n- 第一项\n- 第二项\n\n```ts\nconst cute = true\n```'
    )

    expect(html).toContain('<strong>重点</strong>')
    expect(html).toContain('<ul>')
    expect(html).toContain('<li>第一项</li>')
    expect(html).toContain('<pre><code class="language-ts">')
  })

  it('sanitizes active HTML and unsafe links', () => {
    const html = renderChatMarkdown(
      '<img src=x onerror=alert(1)><script>alert(1)</script>[危险](javascript:alert(1)) [文档](https://example.com)'
    )

    expect(html).not.toContain('<script')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('javascript:')
    expect(html).not.toContain('onerror')
    expect(html).toContain('href="https://example.com"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noreferrer noopener"')
  })
})
