import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ItemRecord, JobRecord, SearchMode } from '../../shared/types'

type JobRow = JobRecord & { inputs: string[] }

const {
  jobs,
  items,
  createJobMock,
  getJobMock,
  deleteJobMock,
  listJobsMock,
  getCurrentJobMock,
  getNextPendingJobMock,
  getActiveJobMock,
  updateJobStatusMock,
  getNextPendingItemMock,
  saveItemResultMock,
  recoverInterruptedJobsMock,
  parseAndValidateInputsMock,
  checkMock,
  throttleMock,
  resetStore
} = vi.hoisted(() => {
  const jobs = new Map<string, JobRow>()
  const items = new Map<number, ItemRecord>()
  let nextItemId = 1

  function row(job: JobRow): JobRecord {
    const {
      id,
      name,
      mode,
      status,
      totalCount,
      completedCount,
      inStockCount,
      outOfStockCount,
      failedCount,
      startedAt,
      createdAt,
      updatedAt
    } = job
    return {
      id,
      name,
      mode,
      status,
      totalCount,
      completedCount,
      inStockCount,
      outOfStockCount,
      failedCount,
      startedAt,
      createdAt,
      updatedAt
    }
  }

  function getCurrentJob(): JobRecord | null {
    const list = [...jobs.values()].filter(
      (j) => j.status === 'running' || j.status === 'paused'
    )
    list.sort((a, b) => {
      const rank = (s: string) => (s === 'running' ? 0 : 1)
      return (
        rank(a.status) - rank(b.status) ||
        a.createdAt - b.createdAt ||
        a.id.localeCompare(b.id)
      )
    })
    return list[0] ? row(list[0]) : null
  }

  function getNextPendingJob(): JobRecord | null {
    const list = [...jobs.values()].filter((j) => j.status === 'pending')
    list.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
    return list[0] ? row(list[0]) : null
  }

  function seedJob(
    id: string,
    name: string,
    mode: SearchMode,
    inputs: string[],
    createdAt: number,
    status: JobRecord['status'] = 'pending'
  ): JobRecord {
    const job: JobRow = {
      id,
      name,
      mode,
      status,
      totalCount: inputs.length,
      completedCount: 0,
      inStockCount: 0,
      outOfStockCount: 0,
      failedCount: 0,
      startedAt: null,
      createdAt,
      updatedAt: createdAt,
      inputs
    }
    jobs.set(id, job)
    inputs.forEach((input, index) => {
      const itemId = nextItemId++
      items.set(itemId, {
        id: itemId,
        jobId: id,
        seq: index + 1,
        input,
        asin: null,
        status: 'pending',
        inStock: null,
        aInStock: null,
        bInStock: null,
        stockStatus: null,
        message: null,
        searchUrl: null,
        title: null,
        price: null,
        stockDetail: null,
        deliveryInfo: null,
        finishedAt: null
      })
    })
    return row(job)
  }

  return {
    jobs,
    items,
    createJobMock: vi.fn(
      (id: string, name: string, mode: SearchMode, inputs: string[]) =>
        seedJob(id, name, mode, inputs, Date.now(), 'pending')
    ),
    getJobMock: vi.fn((id: string) => {
      const job = jobs.get(id)
      return job ? row(job) : null
    }),
    deleteJobMock: vi.fn((id: string) => {
      jobs.delete(id)
      for (const [itemId, item] of items) {
        if (item.jobId === id) items.delete(itemId)
      }
    }),
    listJobsMock: vi.fn((limit = 20) =>
      [...jobs.values()]
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, limit)
        .map(row)
    ),
    getCurrentJobMock: vi.fn(getCurrentJob),
    getNextPendingJobMock: vi.fn(getNextPendingJob),
    getActiveJobMock: vi.fn(() => getCurrentJob() ?? getNextPendingJob()),
    updateJobStatusMock: vi.fn((id: string, status: JobRecord['status']) => {
      const job = jobs.get(id)
      if (!job) return
      const now = Date.now()
      job.status = status
      job.updatedAt = now
      if (status === 'running' && job.startedAt == null) {
        job.startedAt = now
      }
    }),
    getNextPendingItemMock: vi.fn((jobId: string) => {
      const pending = [...items.values()]
        .filter((item) => item.jobId === jobId && item.status === 'pending')
        .sort((a, b) => a.seq - b.seq)
      return pending[0] ?? null
    }),
    saveItemResultMock: vi.fn(
      (
        itemId: number,
        jobId: string,
        result: {
          status: 'done' | 'failed'
          inStock?: boolean | null
          stockStatus?: string | null
          message?: string | null
        }
      ) => {
        const item = items.get(itemId)
        const job = jobs.get(jobId)
        if (!item || !job) throw new Error('missing item/job')
        item.status = result.status
        item.inStock = result.inStock ?? null
        item.stockStatus = result.stockStatus ?? null
        item.message = result.message ?? null
        item.finishedAt = Date.now()
        job.completedCount += 1
        if (result.status === 'failed') job.failedCount += 1
        else if (result.inStock) job.inStockCount += 1
        else job.outOfStockCount += 1
        job.updatedAt = Date.now()
        return row(job)
      }
    ),
    recoverInterruptedJobsMock: vi.fn(() => {
      let count = 0
      for (const job of jobs.values()) {
        if (job.status === 'running') {
          job.status = 'pending'
          job.updatedAt = Date.now()
          count += 1
        }
      }
      return count
    }),
    parseAndValidateInputsMock: vi.fn((text: string) => ({
      inputs: text
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
    })),
    checkMock: vi.fn(async () => ({
      success: true,
      inStock: true,
      stockStatus: 'in_stock',
      message: 'ok'
    })),
    throttleMock: vi.fn(async () => undefined),
    resetStore: () => {
      jobs.clear()
      items.clear()
      nextItemId = 1
    },
    seedJob
  }
})

vi.mock('./db', () => ({
  createJob: createJobMock,
  getJob: getJobMock,
  deleteJob: deleteJobMock,
  listJobs: listJobsMock,
  getCurrentJob: getCurrentJobMock,
  getNextPendingJob: getNextPendingJobMock,
  getActiveJob: getActiveJobMock,
  updateJobStatus: updateJobStatusMock,
  getNextPendingItem: getNextPendingItemMock,
  saveItemResult: saveItemResultMock,
  recoverInterruptedJobs: recoverInterruptedJobsMock,
  getJobItems: vi.fn(),
  exportFailedInputs: vi.fn(() => ''),
  exportOutOfStockInputs: vi.fn(() => '')
}))

vi.mock('./amazon/normalize', () => ({
  parseAndValidateInputs: parseAndValidateInputsMock
}))

vi.mock('./amazon/scraper', () => ({
  AmazonScraper: class {
    throttle = throttleMock
    check = checkMock
    getNetworkStatus = () => ({ mode: 'proxy' as const, label: 'proxy' })
  }
}))

vi.mock('./session-summary', () => ({
  registerSessionJob: vi.fn(),
  unregisterSessionJob: vi.fn(),
  getSessionSummary: vi.fn(() => ({
    hasJob: false,
    jobCount: 0,
    jobName: '等待任务',
    status: 'idle',
    statusLabel: '等待任务',
    totalCount: 0,
    completedCount: 0,
    percent: 0,
    inStockCount: 0,
    outOfStockCount: 0,
    failedCount: 0
  }))
}))

import { JobQueue } from './job-queue'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 1500
): Promise<void> {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('waitFor timeout')
    }
    await sleep(10)
  }
}

describe('JobQueue FIFO scheduling', () => {
  let queue: JobQueue

  beforeEach(() => {
    resetStore()
    createJobMock.mockClear()
    getJobMock.mockClear()
    deleteJobMock.mockClear()
    updateJobStatusMock.mockClear()
    getNextPendingItemMock.mockClear()
    saveItemResultMock.mockClear()
    recoverInterruptedJobsMock.mockClear()
    checkMock.mockReset()
    throttleMock.mockReset()
    checkMock.mockImplementation(async () => ({
      success: true,
      inStock: true,
      stockStatus: 'in_stock',
      message: 'ok'
    }))
    throttleMock.mockResolvedValue(undefined)
    queue = new JobQueue()
  })

  afterEach(async () => {
    await sleep(20)
  })

  it('allows creating a second job while one is running', async () => {
    let releaseFirst!: () => void
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    checkMock.mockImplementationOnce(async () => {
      await firstGate
      return { success: true, inStock: true, stockStatus: 'in_stock' }
    })

    const first = queue.createJob({ mode: 'b', text: 'B0D9PXQLKY' })
    expect(first.ok).toBe(true)

    await waitFor(() => jobs.get(first.job!.id)?.status === 'running')

    const second = queue.createJob({ mode: 'b', text: 'B000000001' })
    expect(second.ok).toBe(true)
    expect(second.job?.status).toBe('pending')
    expect(second.error).toBeUndefined()

    releaseFirst()
    await waitFor(() => jobs.get(second.job!.id)?.status === 'completed')
  })

  it('runs queued jobs in created_at FIFO order', async () => {
    const order: string[] = []
    let releaseA!: () => void
    const gateA = new Promise<void>((resolve) => {
      releaseA = resolve
    })

    checkMock.mockImplementation(async () => {
      const current = getCurrentJobMock()
      if (current) order.push(current.id)
      return { success: true, inStock: true, stockStatus: 'in_stock' }
    })
    checkMock.mockImplementationOnce(async () => {
      await gateA
      const current = getCurrentJobMock()
      if (current) order.push(current.id)
      return { success: true, inStock: true, stockStatus: 'in_stock' }
    })

    const a = queue.createJob({ mode: 'b', text: 'AAAAAAA001' })
    await waitFor(() => jobs.get(a.job!.id)?.status === 'running')
    const b = queue.createJob({ mode: 'b', text: 'BBBBBBB002' })
    const c = queue.createJob({ mode: 'b', text: 'CCCCCCC003' })
    expect(b.ok && c.ok).toBe(true)

    jobs.get(a.job!.id)!.createdAt = 1
    jobs.get(b.job!.id)!.createdAt = 2
    jobs.get(c.job!.id)!.createdAt = 3

    releaseA()
    await waitFor(() => jobs.get(c.job!.id)?.status === 'completed')

    expect(order).toEqual([a.job!.id, b.job!.id, c.job!.id])
    expect(jobs.get(a.job!.id)?.status).toBe('completed')
    expect(jobs.get(b.job!.id)?.status).toBe('completed')
  })

  it('blocks the queue while a job is paused and resumes afterward', async () => {
    let releaseFirst!: () => void
    const gate = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    checkMock.mockImplementationOnce(async () => {
      await gate
      return { success: true, inStock: true, stockStatus: 'in_stock' }
    })

    const a = queue.createJob({ mode: 'b', text: 'AAAAAAA001' })
    await waitFor(() => jobs.get(a.job!.id)?.status === 'running')
    const b = queue.createJob({ mode: 'b', text: 'BBBBBBB002' })
    expect(b.ok).toBe(true)

    queue.pauseJob(a.job!.id)
    expect(jobs.get(a.job!.id)?.status).toBe('paused')
    releaseFirst()
    await sleep(50)
    expect(jobs.get(b.job!.id)?.status).toBe('pending')

    queue.resumeJob(a.job!.id)
    await waitFor(() => jobs.get(b.job!.id)?.status === 'completed')
    expect(jobs.get(a.job!.id)?.status).toBe('completed')
  })

  it('cancels a pending job without stopping the running job', async () => {
    let releaseFirst!: () => void
    const gate = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    checkMock.mockImplementationOnce(async () => {
      await gate
      return { success: true, inStock: true, stockStatus: 'in_stock' }
    })

    const a = queue.createJob({ mode: 'b', text: 'AAAAAAA001' })
    await waitFor(() => jobs.get(a.job!.id)?.status === 'running')
    const b = queue.createJob({ mode: 'b', text: 'BBBBBBB002' })
    const c = queue.createJob({ mode: 'b', text: 'CCCCCCC003' })

    queue.cancelJob(b.job!.id)
    expect(jobs.get(b.job!.id)?.status).toBe('cancelled')
    expect(jobs.get(a.job!.id)?.status).toBe('running')

    releaseFirst()
    await waitFor(() => jobs.get(c.job!.id)?.status === 'completed')
    expect(jobs.get(a.job!.id)?.status).toBe('completed')
    expect(jobs.get(b.job!.id)?.status).toBe('cancelled')
  })

  it('cancels a running job and advances to the next pending job', async () => {
    let releaseFirst!: () => void
    const gate = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    checkMock.mockImplementationOnce(async () => {
      await gate
      return { success: true, inStock: true, stockStatus: 'in_stock' }
    })

    const a = queue.createJob({ mode: 'b', text: 'AAAAAAA001' })
    await waitFor(() => jobs.get(a.job!.id)?.status === 'running')
    const b = queue.createJob({ mode: 'b', text: 'BBBBBBB002' })

    queue.cancelJob(a.job!.id)
    expect(jobs.get(a.job!.id)?.status).toBe('cancelled')
    releaseFirst()

    await waitFor(() => jobs.get(b.job!.id)?.status === 'completed')
    expect(jobs.get(a.job!.id)?.status).toBe('cancelled')
  })

  it('cancels a paused job and starts the next pending job', async () => {
    let releaseFirst!: () => void
    const gate = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    checkMock.mockImplementationOnce(async () => {
      await gate
      return { success: true, inStock: true, stockStatus: 'in_stock' }
    })

    const a = queue.createJob({ mode: 'b', text: 'AAAAAAA001' })
    await waitFor(() => jobs.get(a.job!.id)?.status === 'running')
    const b = queue.createJob({ mode: 'b', text: 'BBBBBBB002' })
    queue.pauseJob(a.job!.id)
    releaseFirst()
    await sleep(30)
    expect(jobs.get(b.job!.id)?.status).toBe('pending')

    queue.cancelJob(a.job!.id)
    await waitFor(() => jobs.get(b.job!.id)?.status === 'completed')
    expect(jobs.get(a.job!.id)?.status).toBe('cancelled')
  })

  it('recovers interrupted running jobs on startup and continues the queue', async () => {
    const now = Date.now()
    createJobMock('old-running', '遗留任务', 'b', ['AAAAAAA001'])
    createJobMock('queued', '排队任务', 'b', ['BBBBBBB002'])
    jobs.get('old-running')!.createdAt = now - 1000
    jobs.get('queued')!.createdAt = now
    updateJobStatusMock('old-running', 'running')

    queue.recoverAndStart()
    expect(recoverInterruptedJobsMock).toHaveBeenCalled()

    await waitFor(
      () =>
        jobs.get('old-running')?.status === 'completed' &&
        jobs.get('queued')?.status === 'completed'
    )
    // recover 会把遗留 running 重置为 pending，再由 FIFO 依次跑完
    expect(recoverInterruptedJobsMock).toHaveReturnedWith(1)
  })
})
