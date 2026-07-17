import { afterEach, describe, expect, it, vi } from 'vitest'

const { getJobMock } = vi.hoisted(() => ({
  getJobMock: vi.fn()
}))

vi.mock('./db', () => ({
  getJob: getJobMock
}))

import {
  clearSessionJobs,
  getSessionSummary,
  registerSessionJob,
  unregisterSessionJob
} from './session-summary'

describe('session summary', () => {
  afterEach(() => {
    clearSessionJobs()
    getJobMock.mockReset()
  })

  it('returns empty summary when no session jobs', () => {
    expect(getSessionSummary().hasJob).toBe(false)
    expect(getSessionSummary().jobName).toBe('等待任务')
  })

  it('aggregates counts across session jobs and prefers running status', () => {
    registerSessionJob('a')
    registerSessionJob('b')
    getJobMock.mockImplementation((id: string) => {
      if (id === 'a') {
        return {
          id: 'a',
          name: '任务A',
          mode: 'a',
          status: 'completed',
          totalCount: 4,
          completedCount: 4,
          inStockCount: 2,
          outOfStockCount: 1,
          failedCount: 1,
          startedAt: 1,
          createdAt: 1,
          updatedAt: 2
        }
      }
      return {
        id: 'b',
        name: '任务B',
        mode: 'b',
        status: 'running',
        totalCount: 2,
        completedCount: 1,
        inStockCount: 1,
        outOfStockCount: 0,
        failedCount: 0,
        startedAt: 3,
        createdAt: 3,
        updatedAt: 4
      }
    })

    const summary = getSessionSummary()
    expect(summary.hasJob).toBe(true)
    expect(summary.jobCount).toBe(2)
    expect(summary.jobName).toBe('本次 2 个任务')
    expect(summary.totalCount).toBe(6)
    expect(summary.completedCount).toBe(5)
    expect(summary.inStockCount).toBe(3)
    expect(summary.outOfStockCount).toBe(1)
    expect(summary.failedCount).toBe(1)
    expect(summary.status).toBe('running')
    expect(summary.percent).toBe(83)
  })

  it('unregisters deleted jobs from the session set', () => {
    registerSessionJob('only')
    getJobMock.mockReturnValue({
      id: 'only',
      name: '单任务',
      mode: 'a',
      status: 'completed',
      totalCount: 1,
      completedCount: 1,
      inStockCount: 1,
      outOfStockCount: 0,
      failedCount: 0,
      startedAt: 1,
      createdAt: 1,
      updatedAt: 1
    })
    expect(getSessionSummary().jobName).toBe('单任务')
    unregisterSessionJob('only')
    expect(getSessionSummary().hasJob).toBe(false)
  })
})
