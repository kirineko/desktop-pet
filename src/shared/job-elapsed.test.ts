import { describe, expect, it } from 'vitest'
import type { JobRecord } from './types'
import { jobElapsedMs } from './types'

function job(partial: Partial<JobRecord>): JobRecord {
  return {
    id: 'j1',
    name: '测试',
    mode: 'b',
    status: 'pending',
    totalCount: 1,
    completedCount: 0,
    inStockCount: 0,
    outOfStockCount: 0,
    failedCount: 0,
    startedAt: null,
    createdAt: 1_000,
    updatedAt: 1_000,
    ...partial
  }
}

describe('jobElapsedMs', () => {
  it('returns 0 for queued jobs that have not started', () => {
    expect(
      jobElapsedMs(
        job({
          status: 'pending',
          startedAt: null,
          createdAt: 1_000,
          updatedAt: 5_000
        }),
        10_000
      )
    ).toBe(0)
  })

  it('counts only from startedAt while running', () => {
    expect(
      jobElapsedMs(
        job({
          status: 'running',
          startedAt: 5_000,
          createdAt: 1_000,
          updatedAt: 5_000
        }),
        8_000
      )
    ).toBe(3_000)
  })

  it('freezes at updatedAt for completed jobs without including queue wait', () => {
    expect(
      jobElapsedMs(
        job({
          status: 'completed',
          startedAt: 5_000,
          createdAt: 1_000,
          updatedAt: 9_000
        }),
        20_000
      )
    ).toBe(4_000)
  })
})
