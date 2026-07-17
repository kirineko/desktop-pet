export interface IdleBubbleSchedulerOptions {
  show: () => void
  canShow: () => boolean
  random?: () => number
  firstDelay?: readonly [number, number]
  repeatDelay?: readonly [number, number]
}

const DEFAULT_FIRST_DELAY = [20_000, 45_000] as const
const DEFAULT_REPEAT_DELAY = [45_000, 120_000] as const

function randomDelay(
  range: readonly [number, number],
  random: () => number
): number {
  const value = Math.max(0, Math.min(1, random()))
  return Math.round(range[0] + (range[1] - range[0]) * value)
}

export function startIdleBubbleScheduler(
  options: IdleBubbleSchedulerOptions
): () => void {
  const random = options.random ?? Math.random
  const firstDelay = options.firstDelay ?? DEFAULT_FIRST_DELAY
  const repeatDelay = options.repeatDelay ?? DEFAULT_REPEAT_DELAY
  let timer: number | null = null
  let stopped = false

  const schedule = (range: readonly [number, number]): void => {
    timer = window.setTimeout(() => {
      if (stopped) return
      if (options.canShow()) {
        options.show()
      }
      schedule(repeatDelay)
    }, randomDelay(range, random))
  }

  schedule(firstDelay)

  return () => {
    stopped = true
    if (timer !== null) {
      window.clearTimeout(timer)
      timer = null
    }
  }
}
