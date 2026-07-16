import type { JobStatus, PetBusinessEvent } from '../../shared/types'
import { EMPTY_JOB_STATUS } from '../../shared/types'
import type { JobQueue } from './job-queue'

/**
 * 业务数据源接口。
 * 库存查询通过 StockPetDataSource 对接 JobQueue；
 * 未来外贸订单分析可另实现此接口。
 */
export interface PetDataSource {
  getStatus(): JobStatus
  start(): void
  stop(): void
  onEvent(listener: (event: PetBusinessEvent) => void): () => void
}

export class StockPetDataSource implements PetDataSource {
  private listeners = new Set<(event: PetBusinessEvent) => void>()
  private unsub: (() => void) | null = null

  constructor(private readonly queue: JobQueue) {}

  getStatus(): JobStatus {
    return this.queue.getStatus()
  }

  start(): void {
    if (this.unsub) return
    this.unsub = this.queue.onEvent((event) => {
      for (const listener of this.listeners) listener(event)
    })
  }

  stop(): void {
    this.unsub?.()
    this.unsub = null
    this.listeners.clear()
  }

  onEvent(listener: (event: PetBusinessEvent) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
}

/** 保留空实现便于测试 */
export class NullPetDataSource implements PetDataSource {
  private listeners = new Set<(event: PetBusinessEvent) => void>()

  getStatus(): JobStatus {
    return { ...EMPTY_JOB_STATUS }
  }

  start(): void {}

  stop(): void {
    this.listeners.clear()
  }

  onEvent(listener: (event: PetBusinessEvent) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
}
