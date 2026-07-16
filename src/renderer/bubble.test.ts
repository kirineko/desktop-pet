// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Bubble } from './bubble'

describe('Bubble', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps a persistent running status visible', () => {
    vi.useFakeTimers()
    const element = document.createElement('button')
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
    const element = document.createElement('button')
    element.className = 'bubble hidden'
    const bubble = new Bubble(element)

    bubble.show('查完了：无货 3 / 失败 1', 'normal', {
      persistent: true,
      dismissible: true
    })
    element.click()

    expect(element.classList.contains('hidden')).toBe(true)
  })
})
