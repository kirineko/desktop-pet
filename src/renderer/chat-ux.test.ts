import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

describe('chat kawaii diary UX', () => {
  it('keeps the companion, decorative, and accessible chat landmarks', () => {
    const html = readFileSync(join(__dirname, 'chat.html'), 'utf8')
    const css = readFileSync(join(__dirname, 'chat.css'), 'utf8')
    const script = readFileSync(join(__dirname, 'chat.ts'), 'utf8')

    expect(html).toContain('class="kawaii-sprinkles"')
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('id="companion-copy"')
    expect(html).toContain('class="composer-sticker"')
    expect(html).toContain('aria-label="历史会话"')
    expect(html).toContain('aria-live="polite"')
    expect(html).toContain('id="rename-dialog"')
    expect(html).toContain('id="rename-input"')

    expect(css).toContain('--cream:')
    expect(css).toContain('.kawaii-sprinkles')
    expect(css).toContain('.message.assistant::before')
    expect(css).toContain('.message-avatar')
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')

    expect(script).not.toContain('window.prompt(')
    expect(script).toContain("className = 'message-avatar'")
  })
})
