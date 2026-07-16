import type { JobRecord, JobRunStatus, SessionSummary } from '../../shared/types'
import { EMPTY_SESSION_SUMMARY, JOB_STATUS_LABELS } from '../../shared/types'
import * as store from './db'

/** 本次进程启动后创建的任务 ID（内存，不持久化） */
const sessionJobIds = new Set<string>()

export function registerSessionJob(jobId: string): void {
  sessionJobIds.add(jobId)
}

export function unregisterSessionJob(jobId: string): void {
  sessionJobIds.delete(jobId)
}

export function clearSessionJobs(): void {
  sessionJobIds.clear()
}

function aggregateStatus(statuses: Set<JobRunStatus>): {
  status: SessionSummary['status']
  statusLabel: string
} {
  if (statuses.has('running')) {
    return { status: 'running', statusLabel: JOB_STATUS_LABELS.running }
  }
  if (statuses.has('paused')) {
    return { status: 'paused', statusLabel: JOB_STATUS_LABELS.paused }
  }
  if (statuses.has('pending')) {
    return { status: 'pending', statusLabel: JOB_STATUS_LABELS.pending }
  }
  if (statuses.size > 0) {
    return { status: 'completed', statusLabel: JOB_STATUS_LABELS.completed }
  }
  return { status: 'idle', statusLabel: '等待任务' }
}

export function getSessionSummary(): SessionSummary {
  if (sessionJobIds.size === 0) {
    return { ...EMPTY_SESSION_SUMMARY }
  }

  const jobs: JobRecord[] = []
  for (const id of sessionJobIds) {
    const job = store.getJob(id)
    if (job) jobs.push(job)
  }

  if (jobs.length === 0) {
    return { ...EMPTY_SESSION_SUMMARY }
  }

  jobs.sort((a, b) => a.createdAt - b.createdAt)

  const totalCount = jobs.reduce((sum, j) => sum + j.totalCount, 0)
  const completedCount = jobs.reduce((sum, j) => sum + j.completedCount, 0)
  const inStockCount = jobs.reduce((sum, j) => sum + j.inStockCount, 0)
  const outOfStockCount = jobs.reduce((sum, j) => sum + j.outOfStockCount, 0)
  const failedCount = jobs.reduce((sum, j) => sum + j.failedCount, 0)
  const percent =
    totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

  const statuses = new Set(jobs.map((j) => j.status))
  const { status, statusLabel } = aggregateStatus(statuses)
  const jobCount = jobs.length
  const jobName =
    jobCount === 1 ? jobs[0].name || '查询任务' : `本次 ${jobCount} 个任务`

  return {
    hasJob: true,
    jobCount,
    jobName,
    status,
    statusLabel,
    totalCount,
    completedCount,
    percent,
    inStockCount,
    outOfStockCount,
    failedCount
  }
}
