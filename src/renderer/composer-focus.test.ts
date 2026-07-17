// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { focusComposerInput } from './composer-focus'

describe('focusComposerInput', () => {
  it('restores focus after the input is enabled', () => {
    const input = document.createElement('textarea')
    document.body.appendChild(input)
    const schedule = vi.fn((callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })

    focusComposerInput(input, schedule)

    expect(schedule).toHaveBeenCalledOnce()
    expect(document.activeElement).toBe(input)
  })

  it('does not focus a disabled input', () => {
    const input = document.createElement('textarea')
    input.disabled = true
    document.body.appendChild(input)
    const schedule = vi.fn((callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })

    focusComposerInput(input, schedule)

    expect(document.activeElement).not.toBe(input)
  })
})
