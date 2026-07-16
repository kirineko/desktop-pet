/** 四只像素宠物 */
export type PetId = 'feibi' | 'guga' | 'doro' | 'nuonuo'

export const PET_IDS: PetId[] = ['feibi', 'guga', 'doro', 'nuonuo']

export const PET_LABELS: Record<PetId, string> = {
  feibi: '菲比',
  guga: '咕嘎',
  doro: 'Doro',
  nuonuo: '糯糯'
}

/** 宠物动画/业务状态 */
export type PetVisualState = 'idle' | 'drag' | 'click' | 'busy' | 'alert'

/** 持久化配置 */
export interface PetConfig {
  petId: PetId
  alwaysOnTop: boolean
  windowX: number | null
  windowY: number | null
  visible: boolean
}

export const DEFAULT_CONFIG: PetConfig = {
  petId: 'doro',
  alwaysOnTop: true,
  windowX: null,
  windowY: null,
  visible: true
}

/** 搜索模式：链接 / 商品码 / 双重确认 */
export type SearchMode = 'a' | 'b' | 'ab'

export const SEARCH_MODE_LABELS: Record<SearchMode, string> = {
  a: '链接查询(A)',
  b: '商品码(B)',
  ab: '双重确认(A+B)'
}

export type JobRunStatus =
  | 'pending'
  | 'running'
  | 'paused'
  | 'completed'
  | 'cancelled'

export type ItemRunStatus = 'pending' | 'done' | 'failed'

export type ItemFilter = 'all' | 'in_stock' | 'out_of_stock' | 'failed'

export interface JobRecord {
  id: string
  name: string
  mode: SearchMode
  status: JobRunStatus
  totalCount: number
  completedCount: number
  inStockCount: number
  outOfStockCount: number
  failedCount: number
  createdAt: number
  updatedAt: number
}

export interface ItemRecord {
  id: number
  jobId: string
  seq: number
  input: string
  asin: string | null
  status: ItemRunStatus
  inStock: boolean | null
  aInStock: boolean | null
  bInStock: boolean | null
  stockStatus: string | null
  message: string | null
  searchUrl: string | null
  finishedAt: number | null
}

/** 桌宠进度摘要 */
export interface JobStatus {
  hasJob: boolean
  jobId?: string
  jobName?: string
  statusLabel?: string
  mode?: SearchMode
  completedCount: number
  totalCount: number
  percent: number
  inStockCount: number
  outOfStockCount: number
  failedCount: number
}

export const EMPTY_JOB_STATUS: JobStatus = {
  hasJob: false,
  completedCount: 0,
  totalCount: 0,
  percent: 0,
  inStockCount: 0,
  outOfStockCount: 0,
  failedCount: 0
}

export interface CheckResult {
  success: boolean
  inStock: boolean | null
  asin?: string
  aInStock?: boolean
  bInStock?: boolean
  stockStatus?: string
  message?: string
  searchUrl?: string
}

export interface TransformCodeResult {
  input: string
  output?: string
  error?: string
  success: boolean
}

export interface TransformCodesResponse {
  results: TransformCodeResult[]
  outputText: string
  successCount: number
  errorCount: number
}

export interface CreateJobInput {
  mode: SearchMode
  name?: string
  text: string
}

export interface CreateJobResult {
  ok: boolean
  error?: string
  job?: JobRecord
}

export interface NetworkStatus {
  mode: 'proxy' | 'missing'
  label: string
}

/** 主进程 → 渲染进程的业务事件 */
export type PetBusinessEvent =
  | { type: 'status'; status: JobStatus }
  | { type: 'alert'; message: string }
  | { type: 'message'; message: string; persistent?: boolean }

export const JOB_STATUS_LABELS: Record<JobRunStatus, string> = {
  pending: '等待中',
  running: '查询中',
  paused: '已暂停',
  completed: '已完成',
  cancelled: '已取消'
}

export function jobToStatus(job: JobRecord | null): JobStatus {
  if (!job) return { ...EMPTY_JOB_STATUS }
  const active =
    job.status === 'pending' ||
    job.status === 'running' ||
    job.status === 'paused'
  const percent =
    job.totalCount > 0
      ? Math.round((job.completedCount / job.totalCount) * 100)
      : 0
  return {
    hasJob: active,
    jobId: job.id,
    jobName: job.name,
    statusLabel: JOB_STATUS_LABELS[job.status],
    mode: job.mode,
    completedCount: job.completedCount,
    totalCount: job.totalCount,
    percent,
    inStockCount: job.inStockCount,
    outOfStockCount: job.outOfStockCount,
    failedCount: job.failedCount
  }
}

/** preload 暴露给渲染进程的 API */
export interface DesktopPetApi {
  getConfig: () => Promise<PetConfig>
  setPetId: (petId: PetId) => Promise<PetConfig>
  setAlwaysOnTop: (value: boolean) => Promise<PetConfig>
  moveWindow: (dx: number, dy: number) => Promise<void>
  savePosition: () => Promise<void>
  showContextMenu: () => Promise<void>
  openPanel: () => Promise<void>
  showPet: () => Promise<void>
  getNetworkStatus: () => Promise<NetworkStatus>
  getJobStatus: () => Promise<JobStatus>
  createJob: (input: CreateJobInput) => Promise<CreateJobResult>
  pauseJob: () => Promise<JobRecord | null>
  resumeJob: () => Promise<JobRecord | null>
  cancelJob: () => Promise<JobRecord | null>
  deleteJob: (jobId: string) => Promise<{ ok: boolean }>
  getActiveJob: () => Promise<JobRecord | null>
  listJobs: (limit?: number) => Promise<JobRecord[]>
  getJob: (jobId: string) => Promise<JobRecord | null>
  getJobItems: (
    jobId: string,
    filter: ItemFilter,
    offset?: number,
    limit?: number
  ) => Promise<{ items: ItemRecord[]; total: number }>
  transformCodes: (text: string) => Promise<TransformCodesResponse>
  exportFailed: (jobId: string) => Promise<string>
  exportOutOfStock: (jobId: string) => Promise<string>
  onConfigChanged: (cb: (config: PetConfig) => void) => () => void
  onBusinessEvent: (cb: (event: PetBusinessEvent) => void) => () => void
  onJobUpdated: (cb: (job: JobRecord | null) => void) => () => void
}

declare global {
  interface Window {
    desktopPet: DesktopPetApi
  }
}
