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

/** 结果列表中的简短查询方式标签 */
export const RESULT_MODE_LABELS: Record<SearchMode, string> = {
  a: '链接',
  b: '搜索',
  ab: '全部'
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
  /** 首次进入 running 的时间；排队中尚未开始时为 null */
  startedAt: number | null
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
  title: string | null
  price: string | null
  stockDetail: string | null
  deliveryInfo: string | null
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

/** 本次应用启动后创建的任务汇总（对齐原悬浮球） */
export interface SessionSummary {
  hasJob: boolean
  jobCount: number
  jobName: string
  status: 'idle' | 'pending' | 'running' | 'paused' | 'completed'
  statusLabel: string
  totalCount: number
  completedCount: number
  percent: number
  inStockCount: number
  outOfStockCount: number
  failedCount: number
}

export const EMPTY_SESSION_SUMMARY: SessionSummary = {
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
  title?: string | null
  price?: string | null
  stockDetail?: string | null
  deliveryInfo?: string | null
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
  | { type: 'session'; summary: SessionSummary }
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

/** 执行耗时：从首次开始查询起算，不含排队等待。 */
export function jobElapsedMs(job: JobRecord, now = Date.now()): number {
  if (job.startedAt == null) return 0
  const end = job.status === 'running' ? now : job.updatedAt
  return Math.max(0, end - job.startedAt)
}

/** —— AI 角色对话 —— */

export type ChatMessageRole = 'user' | 'assistant' | 'system'

export type ChatTonePreference =
  | 'gentle'
  | 'energetic'
  | 'tsundere'
  | 'soft'
  | 'playful'

export type ChatPersonalityBias =
  | 'caring'
  | 'mischievous'
  | 'shy'
  | 'confident'
  | 'sleepy'

export interface PersonaProfileFields {
  userCallName: string
  relationship: string
  personalityBias: ChatPersonalityBias
  tonePreference: ChatTonePreference
  extraNotes: string
}

export interface PersonaProfile extends PersonaProfileFields {
  petId: PetId
  updatedAt: number
}

export interface ConversationRecord {
  id: string
  petId: PetId
  title: string
  createdAt: number
  updatedAt: number
  lastMessagePreview: string | null
}

export interface ChatMessageRecord {
  id: string
  conversationId: string
  role: ChatMessageRole
  content: string
  createdAt: number
  status: 'complete' | 'streaming' | 'error' | 'cancelled'
  errorCode?: ChatErrorCode | null
}

export type ChatErrorCode =
  | 'missing_api_key'
  | 'invalid_api_key'
  | 'rate_limited'
  | 'network'
  | 'content_filter'
  | 'insufficient_resource'
  | 'aborted'
  | 'unknown'

export interface ApiKeyStatus {
  configured: boolean
  masked: string | null
  encryptionAvailable: boolean
}

export type ChatStreamEvent =
  | {
      type: 'start'
      conversationId: string
      userMessageId: string
      assistantMessageId: string
    }
  | {
      type: 'delta'
      conversationId: string
      assistantMessageId: string
      delta: string
    }
  | {
      type: 'done'
      conversationId: string
      assistantMessageId: string
      content: string
    }
  | {
      type: 'error'
      conversationId: string
      assistantMessageId: string
      code: ChatErrorCode
      message: string
    }
  | {
      type: 'cancelled'
      conversationId: string
      assistantMessageId: string
    }

export interface OpenChatOptions {
  petId?: PetId
  view?: 'chat' | 'persona' | 'settings'
  conversationId?: string
}

export interface SendChatMessageInput {
  conversationId: string
  content: string
}

export interface UpdatePersonaInput {
  petId: PetId
  fields: PersonaProfileFields
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
  openChat: (options?: OpenChatOptions) => Promise<void>
  getChatOpenOptions: () => Promise<OpenChatOptions | null>
  showPet: () => Promise<void>
  getNetworkStatus: () => Promise<NetworkStatus>
  getJobStatus: () => Promise<JobStatus>
  getSessionSummary: () => Promise<SessionSummary>
  createJob: (input: CreateJobInput) => Promise<CreateJobResult>
  pauseJob: (jobId: string) => Promise<JobRecord | null>
  resumeJob: (jobId: string) => Promise<JobRecord | null>
  cancelJob: (jobId: string) => Promise<JobRecord | null>
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
  openExternal: (url: string) => Promise<void>
  getApiKeyStatus: () => Promise<ApiKeyStatus>
  setApiKey: (apiKey: string) => Promise<ApiKeyStatus>
  clearApiKey: () => Promise<ApiKeyStatus>
  testApiKey: (apiKey?: string) => Promise<{ ok: boolean; message: string }>
  getPersonaProfile: (petId: PetId) => Promise<PersonaProfile>
  updatePersonaProfile: (input: UpdatePersonaInput) => Promise<PersonaProfile>
  listConversations: (petId: PetId) => Promise<ConversationRecord[]>
  createConversation: (petId: PetId, title?: string) => Promise<ConversationRecord>
  renameConversation: (
    conversationId: string,
    title: string
  ) => Promise<ConversationRecord | null>
  deleteConversation: (conversationId: string) => Promise<{ ok: boolean }>
  getConversationMessages: (
    conversationId: string
  ) => Promise<ChatMessageRecord[]>
  sendChatMessage: (input: SendChatMessageInput) => Promise<{
    ok: boolean
    error?: string
    code?: ChatErrorCode
  }>
  stopChatGeneration: (conversationId?: string) => Promise<{ ok: boolean }>
  onConfigChanged: (cb: (config: PetConfig) => void) => () => void
  onBusinessEvent: (cb: (event: PetBusinessEvent) => void) => () => void
  onJobUpdated: (cb: (job: JobRecord | null) => void) => () => void
  onChatStream: (cb: (event: ChatStreamEvent) => void) => () => void
  onChatOpenOptions: (cb: (options: OpenChatOptions) => void) => () => void
}

declare global {
  interface Window {
    desktopPet: DesktopPetApi
  }
}
