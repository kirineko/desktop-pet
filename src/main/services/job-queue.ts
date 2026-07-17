import { randomUUID } from 'crypto'
import type {
  CreateJobInput,
  CreateJobResult,
  ItemFilter,
  ItemRecord,
  JobRecord,
  PetBusinessEvent
} from '../../shared/types'
import { jobToStatus } from '../../shared/types'
import { AmazonScraper } from './amazon/scraper'
import { parseAndValidateInputs } from './amazon/normalize'
import * as store from './db'
import {
  getSessionSummary,
  registerSessionJob,
  unregisterSessionJob
} from './session-summary'

type Listener = (event: PetBusinessEvent) => void
type JobListener = (job: JobRecord | null) => void

export class JobQueue {
  private scraper = new AmazonScraper()
  private running = false
  private pauseRequested = false
  private cancelRequested = false
  private consecutiveFailures = 0
  private lastOutOfStockAlertAt = 0
  private outOfStockSinceAlert = 0
  private listeners = new Set<Listener>()
  private jobListeners = new Set<JobListener>()

  onEvent(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  onJobUpdated(listener: JobListener): () => void {
    this.jobListeners.add(listener)
    return () => this.jobListeners.delete(listener)
  }

  private emit(event: PetBusinessEvent): void {
    for (const listener of this.listeners) listener(event)
  }

  private emitJob(job: JobRecord | null): void {
    for (const listener of this.jobListeners) listener(job)
    if (job) {
      this.emit({ type: 'status', status: jobToStatus(job) })
    } else {
      this.emit({ type: 'status', status: jobToStatus(null) })
    }
    this.emitSession()
  }

  private emitSession(): void {
    this.emit({ type: 'session', summary: getSessionSummary() })
  }

  getStatus() {
    const active = store.getActiveJob()
    if (active) return jobToStatus(active)
    const recent = store.listJobs(1)[0]
    if (recent?.status === 'completed') return jobToStatus(recent)
    return jobToStatus(null)
  }

  getSessionSummary() {
    return getSessionSummary()
  }

  getActiveJob(): JobRecord | null {
    return store.getActiveJob()
  }

  listJobs(limit = 20): JobRecord[] {
    return store.listJobs(limit)
  }

  getJob(jobId: string): JobRecord | null {
    return store.getJob(jobId)
  }

  getJobItems(
    jobId: string,
    filter: ItemFilter,
    offset = 0,
    limit = 100
  ): { items: ItemRecord[]; total: number } {
    return store.getJobItems(jobId, filter, offset, limit)
  }

  exportFailed(jobId: string): string {
    return store.exportFailedInputs(jobId)
  }

  exportOutOfStock(jobId: string): string {
    return store.exportOutOfStockInputs(jobId)
  }

  getNetworkStatus() {
    return this.scraper.getNetworkStatus()
  }

  /** 启动时恢复异常中断的 running，并继续 FIFO 调度。 */
  recoverAndStart(): void {
    store.recoverInterruptedJobs()
    const active = store.getActiveJob()
    this.emitJob(active)
    void this.loop()
  }

  createJob(input: CreateJobInput): CreateJobResult {
    const { inputs, error } = parseAndValidateInputs(input.text, input.mode)
    if (error || inputs.length === 0) {
      return { ok: false, error: error || '输入为空' }
    }

    const name =
      (input.name || '').trim() ||
      `查询 ${new Date().toLocaleString('zh-CN', { hour12: false })}`
    const job = store.createJob(randomUUID(), name, input.mode, inputs)
    registerSessionJob(job.id)

    const current = store.getCurrentJob()
    if (current && current.id !== job.id) {
      this.emit({
        type: 'message',
        message: `已排队，前面还有任务在忙～`
      })
    } else {
      this.emit({ type: 'message', message: `开始查 ${inputs.length} 条啦～` })
    }

    // 面板侧栏靠 job-updated 刷新；桌宠状态保持当前 running/paused。
    this.emitJob(current ?? job)
    void this.loop()
    return { ok: true, job }
  }

  pauseJob(jobId: string): JobRecord | null {
    const job = store.getJob(jobId)
    if (!job || job.status !== 'running') return job
    this.pauseRequested = true
    store.updateJobStatus(jobId, 'paused')
    const updated = store.getJob(jobId)
    this.emit({ type: 'message', message: '先歇一会儿～' })
    this.emitJob(updated)
    return updated
  }

  resumeJob(jobId: string): JobRecord | null {
    const job = store.getJob(jobId)
    if (!job || job.status !== 'paused') return job
    this.pauseRequested = false
    this.cancelRequested = false
    store.updateJobStatus(jobId, 'pending')
    const updated = store.getJob(jobId)
    this.emit({ type: 'message', message: '继续干活！' })
    this.emitJob(updated)
    void this.loop()
    return updated
  }

  cancelJob(jobId: string): JobRecord | null {
    const job = store.getJob(jobId)
    if (!job) return null
    if (job.status === 'completed' || job.status === 'cancelled') return job

    if (job.status === 'running') {
      this.cancelRequested = true
      this.pauseRequested = false
    }

    store.updateJobStatus(jobId, 'cancelled')
    const updated = store.getJob(jobId)
    this.emit({ type: 'message', message: '任务取消了' })
    this.emitJob(updated)
    void this.loop()
    return updated
  }

  deleteJob(jobId: string): { ok: boolean } {
    const job = store.getJob(jobId)
    if (!job) return { ok: false }
    // 若删除的是正在跑的任务，先请求取消，让 loop 干净退出，避免竞态。
    if (store.getCurrentJob()?.id === jobId && job.status === 'running') {
      this.cancelRequested = true
      this.pauseRequested = false
    }
    store.deleteJob(jobId)
    unregisterSessionJob(jobId)
    this.emitJob(store.getActiveJob())
    void this.loop()
    return { ok: true }
  }

  private async loop(): Promise<void> {
    if (this.running) return
    this.running = true

    try {
      while (true) {
        const current = store.getCurrentJob()
        if (current?.status === 'paused') break

        const job =
          current?.status === 'running'
            ? current
            : store.getNextPendingJob()
        if (!job) break

        this.cancelRequested = false
        this.pauseRequested = false
        this.consecutiveFailures = 0

        const outcome = await this.processJob(job)
        if (outcome === 'paused') break
        // completed / cancelled / deleted → 继续取下一个 FIFO 任务
      }
    } finally {
      this.running = false
    }
  }

  /** 处理单个任务直到完成、暂停或取消。 */
  private async processJob(
    job: JobRecord
  ): Promise<'completed' | 'paused' | 'cancelled'> {
    if (job.status === 'pending') {
      store.updateJobStatus(job.id, 'running')
      this.emitJob(store.getJob(job.id))
    }

    while (true) {
      const latest = store.getJob(job.id)
      if (!latest || latest.status === 'cancelled') return 'cancelled'
      if (latest.status === 'paused') return 'paused'

      const item = store.getNextPendingItem(job.id)
      if (!item) {
        store.updateJobStatus(job.id, 'completed')
        const done = store.getJob(job.id)!
        this.emit({
          type: 'message',
          message: `查完了：有货 ${done.inStockCount} · 无货 ${done.outOfStockCount} · 失败 ${done.failedCount}（点击关闭）`,
          persistent: true
        })
        this.emitJob(done)
        return 'completed'
      }

      if (this.cancelRequested) return 'cancelled'
      if (this.pauseRequested) {
        store.updateJobStatus(job.id, 'paused')
        this.emitJob(store.getJob(job.id))
        return 'paused'
      }

      await this.scraper.throttle()
      if (this.cancelRequested) return 'cancelled'
      if (this.pauseRequested) {
        store.updateJobStatus(job.id, 'paused')
        this.emitJob(store.getJob(job.id))
        return 'paused'
      }

      const current = store.getJob(job.id)
      if (!current || current.status === 'cancelled') return 'cancelled'
      if (current.status === 'paused') return 'paused'

      const result = await this.scraper.check(item.input, current.mode)

      if (this.cancelRequested) return 'cancelled'
      const afterCheck = store.getJob(job.id)
      if (!afterCheck || afterCheck.status === 'cancelled') return 'cancelled'

      const softBlocked =
        result.stockStatus === '__soft_block__' ||
        (result.message || '').includes('反爬限制')

      const updated = store.saveItemResult(item.id, job.id, {
        status: result.success ? 'done' : 'failed',
        asin: result.asin ?? null,
        inStock: result.inStock,
        aInStock: result.aInStock ?? null,
        bInStock: result.bInStock ?? null,
        stockStatus:
          result.stockStatus === '__soft_block__'
            ? null
            : result.stockStatus ?? null,
        message: result.message ?? null,
        searchUrl: result.searchUrl ?? null,
        title: result.title ?? null,
        price: result.price ?? null,
        stockDetail: result.stockDetail ?? null,
        deliveryInfo: result.deliveryInfo ?? null
      })

      const shouldAlertOutOfStock =
        result.success && result.inStock === false

      if (result.success) {
        this.consecutiveFailures = 0
      } else {
        this.consecutiveFailures += 1
      }

      this.emitJob(updated)
      if (shouldAlertOutOfStock) {
        this.maybeAlertOutOfStock(updated.outOfStockCount)
      }

      if (softBlocked || this.consecutiveFailures >= 5) {
        store.updateJobStatus(job.id, 'paused')
        const paused = store.getJob(job.id)
        this.emitJob(paused)
        this.emit({
          type: 'alert',
          message: softBlocked
            ? '好像被限制了，先暂停？'
            : '连续失败较多，已自动暂停'
        })
        return 'paused'
      }
    }
  }

  private maybeAlertOutOfStock(totalOut: number): void {
    const now = Date.now()
    this.outOfStockSinceAlert += 1
    if (
      this.outOfStockSinceAlert >= 5 ||
      now - this.lastOutOfStockAlertAt > 30000
    ) {
      this.outOfStockSinceAlert = 0
      this.lastOutOfStockAlertAt = now
      this.emit({
        type: 'alert',
        message: `又找到无货啦（累计 ${totalOut}）`
      })
    }
  }
}
