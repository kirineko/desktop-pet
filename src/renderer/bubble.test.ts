// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Bubble } from './bubble'

describe('Bubble', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps a persistent running status visible', () => {
    vi.useFakeTimers()
    const element = document.createElement('div')
    element.className = 'bubble hidden'
    const bubble = new Bubble(element)

    bubble.show('42% · 无货 3', 'busy', {
      persistent: true,
      dismissible: false
    })
    vi.advanceTimersByTime(10_000)

    expect(element.classList.contains('hidden')).toBe(false)
    expect(element.classList.contains('dismissible')).toBe(false)
  })

  it('dismisses a persistent completion result when its bubble is clicked', () => {
    vi.useFakeTimers()
    const element = document.createElement('div')
    element.className = 'bubble hidden'
    const bubble = new Bubble(element)

    bubble.show('查完了：无货 3 / 失败 1', 'normal', {
      persistent: true,
      dismissible: true
    })
    element.click()

    expect(element.classList.contains('hidden')).toBe(true)
  })

  it('renders action menu and routes clicks', () => {
    const element = document.createElement('div')
    element.className = 'bubble hidden'
    document.body.appendChild(element)
    const bubble = new Bubble(element)
    const onAction = vi.fn()

    bubble.show('想做什么呢？', 'normal', {
      persistent: true,
      actions: [
        { id: 'chat', label: '和我聊天' },
        { id: 'inventory', label: '库存管理' }
      ],
      onAction
    })

    expect(element.classList.contains('menu')).toBe(true)
    expect(bubble.isMenuOpen()).toBe(true)
    const chatBtn = element.querySelector(
      '[data-action-id="chat"]'
    ) as HTMLButtonElement
    chatBtn.click()
    expect(onAction).toHaveBeenCalledWith('chat')
    expect(element.classList.contains('hidden')).toBe(true)
  })

  it('renders an explicit close button for action menus', () => {
    const element = document.createElement('div')
    element.className = 'bubble hidden'
    const bubble = new Bubble(element)

    bubble.show('想做什么呢？', 'normal', {
      persistent: true,
      actions: [{ id: 'chat', label: '和我聊天' }]
    })

    const close = element.querySelector(
      '[data-bubble-close]'
    ) as HTMLButtonElement
    expect(close).not.toBeNull()
    expect(close.getAttribute('aria-label')).toBe('关闭菜单')
    close.click()
    expect(element.classList.contains('hidden')).toBe(true)
  })

  it('allows idle chatter only when no bubble is visible', () => {
    const element = document.createElement('div')
    element.className = 'bubble hidden'
    const bubble = new Bubble(element)

    expect(bubble.canShowIdleMessage()).toBe(true)
    bubble.show('任务完成', 'normal', { persistent: true })
    expect(bubble.canShowIdleMessage()).toBe(false)
    bubble.hide()
    expect(bubble.canShowIdleMessage()).toBe(true)
  })
})
