// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { startIdleBubbleScheduler } from './idle-bubble-scheduler'

describe('idle bubble scheduler', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('uses a shorter first delay and balanced random repeat delays', () => {
    vi.useFakeTimers()
    const show = vi.fn()
    const stop = startIdleBubbleScheduler({
      show,
      canShow: () => true,
      random: () => 0
    })

    vi.advanceTimersByTime(19_999)
    expect(show).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(show).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(44_999)
    expect(show).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1)
    expect(show).toHaveBeenCalledTimes(2)
    stop()
  })

  it('skips blocked moments without replacing the current bubble', () => {
    vi.useFakeTimers()
    let allowed = false
    const show = vi.fn()
    const stop = startIdleBubbleScheduler({
      show,
      canShow: () => allowed,
      random: () => 0
    })

    vi.advanceTimersByTime(20_000)
    expect(show).not.toHaveBeenCalled()
    allowed = true
    vi.advanceTimersByTime(45_000)
    expect(show).toHaveBeenCalledTimes(1)
    stop()
  })
})
