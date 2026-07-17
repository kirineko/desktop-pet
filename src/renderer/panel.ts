import './panel.css'
import type {
  ItemFilter,
  ItemRecord,
  JobRecord,
  JobRunStatus,
  SearchMode
} from '../shared/types'
import {
  JOB_STATUS_LABELS,
  RESULT_MODE_LABELS,
  SEARCH_MODE_LABELS,
  jobElapsedMs
} from '../shared/types'

const MODE_HINTS: Record<SearchMode, string> = {
  a: '粘贴亚马逊商品链接，每行一条',
  b: '粘贴商品码（非链接），每行一条',
  ab: '链接或商品码均可；两边都搜到才算有货'
}

const MODE_PLACEHOLDERS: Record<SearchMode, string> = {
  a: 'https://www.amazon.co.jp/dp/B0XXXXXXXX',
  b: 'gx-b0f3vvnbkz041 或 B0F3VVNBKZ',
  ab: '链接或商品码，每行一条'
}

const RESULT_LIMIT = 400
const HISTORY_COLLAPSE_LIMIT = 5
const ACTIVE_STATUSES: JobRunStatus[] = ['pending', 'running', 'paused']

const timeFmt = new Intl.DateTimeFormat('zh-CN', {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false
})

let currentMode: SearchMode = 'a'
let selectedJobId: string | null = null
let selectedJob: JobRecord | null = null
let currentFilter: ItemFilter = 'out_of_stock'
let cachedJobs: JobRecord[] = []
let historyExpanded = false

const els = {
  taskCount: document.getElementById('task-count') as HTMLElement,
  taskList: document.getElementById('task-list') as HTMLElement,
  btnNewTask: document.getElementById('btn-new-task') as HTMLButtonElement,
  btnOpenTools: document.getElementById('btn-open-tools') as HTMLButtonElement,
  btnEmptyNew: document.getElementById('btn-empty-new') as HTMLButtonElement,
  // views
  createView: document.getElementById('create-view') as HTMLElement,
  detailView: document.getElementById('detail-view') as HTMLElement,
  emptyView: document.getElementById('empty-view') as HTMLElement,
  // create
  modeBtns: Array.from(document.querySelectorAll<HTMLButtonElement>('.mode-btn')),
  modeHint: document.getElementById('mode-hint') as HTMLElement,
  jobName: document.getElementById('job-name') as HTMLInputElement,
  jobInput: document.getElementById('job-input') as HTMLTextAreaElement,
  lineCount: document.getElementById('line-count') as HTMLElement,
  createError: document.getElementById('create-error') as HTMLElement,
  btnStart: document.getElementById('btn-start') as HTMLButtonElement,
  // detail
  detailTitle: document.getElementById('detail-title') as HTMLElement,
  detailMeta: document.getElementById('detail-meta') as HTMLElement,
  detailBadge: document.getElementById('detail-status-badge') as HTMLElement,
  btnPause: document.getElementById('btn-pause') as HTMLButtonElement,
  btnResume: document.getElementById('btn-resume') as HTMLButtonElement,
  btnCancel: document.getElementById('btn-cancel') as HTMLButtonElement,
  progress: document.querySelector('.progress') as HTMLElement,
  progressBar: document.getElementById('progress-bar') as HTMLElement,
  progressText: document.getElementById('progress-text') as HTMLElement,
  oosHero: document.getElementById('oos-hero') as HTMLElement,
  oosCount: document.getElementById('oos-count') as HTMLElement,
  oosSub: document.getElementById('oos-sub') as HTMLElement,
  btnCopyOos: document.getElementById('btn-copy-oos') as HTMLButtonElement,
  jobStats: document.getElementById('job-stats') as HTMLElement,
  filterGroup: document.getElementById('filter-group') as HTMLElement,
  btnCopyFailed: document.getElementById('btn-copy-failed') as HTMLButtonElement,
  results: document.getElementById('results') as HTMLElement,
  // tools modal
  toolsModal: document.getElementById('tools-modal') as HTMLElement,
  toolsClose: document.getElementById('tools-close') as HTMLButtonElement,
  transformIn: document.getElementById('transform-in') as HTMLTextAreaElement,
  transformOut: document.getElementById('transform-out') as HTMLTextAreaElement,
  transformCount: document.getElementById('transform-count') as HTMLElement,
  btnTransform: document.getElementById('btn-transform') as HTMLButtonElement,
  btnTransformCopy: document.getElementById('btn-transform-copy') as HTMLButtonElement
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function countLines(text: string): number {
  const seen = new Set<string>()
  for (const line of text.split(/[\r\n,]+/)) {
    const v = line.trim()
    if (v) seen.add(v)
  }
  return seen.size
}

function isActive(status: JobRunStatus): boolean {
  return ACTIVE_STATUSES.includes(status)
}

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const hh = Math.floor(total / 3600)
  const mm = Math.floor((total % 3600) / 60)
  const ss = total % 60
  const pad = (n: number): string => String(n).padStart(2, '0')
  return hh > 0 ? `${hh}:${pad(mm)}:${pad(ss)}` : `${pad(mm)}:${pad(ss)}`
}

async function flash(btn: HTMLButtonElement, label: string): Promise<void> {
  const original = btn.innerHTML
  btn.textContent = label
  setTimeout(() => {
    btn.innerHTML = original
  }, 1500)
}

/* ---------- view switching ---------- */
function showView(name: 'create' | 'detail' | 'empty'): void {
  els.createView.hidden = name !== 'create'
  els.detailView.hidden = name !== 'detail'
  els.emptyView.hidden = name !== 'empty'
}

function showCreate(): void {
  selectedJobId = null
  selectedJob = null
  renderSidebar(cachedJobs)
  showCreateError(null)
  showView('create')
  els.jobInput.focus()
}

/* ---------- create form ---------- */
function setMode(mode: SearchMode): void {
  currentMode = mode
  els.modeBtns.forEach((btn) => {
    const active = btn.dataset.mode === mode
    btn.classList.toggle('active', active)
    btn.setAttribute('aria-pressed', String(active))
  })
  els.modeHint.textContent = MODE_HINTS[mode]
  els.jobInput.placeholder = MODE_PLACEHOLDERS[mode]
}

function showCreateError(message: string | null): void {
  if (!message) {
    els.createError.hidden = true
    els.createError.textContent = ''
    return
  }
  els.createError.hidden = false
  els.createError.textContent = message
}

/* ---------- sidebar ---------- */
function renderTaskItem(job: JobRecord): string {
  const selected = job.id === selectedJobId
  const hasOos = job.outOfStockCount > 0
  const oosTag = hasOos
    ? `<span class="tag oos">缺货 ${job.outOfStockCount}</span>`
    : ''
  const failTag =
    job.failedCount > 0
      ? `<span class="tag fail">失败 ${job.failedCount}</span>`
      : ''
  const classes = [
    'task-item',
    selected ? 'selected' : '',
    hasOos ? 'has-oos' : ''
  ]
    .filter(Boolean)
    .join(' ')
  return `<div class="task-row">
    <button type="button" class="${classes}" data-id="${job.id}" aria-pressed="${selected}">
      <span class="task-item-top">
        <span class="task-item-name">${escapeHtml(job.name)}</span>
        <span class="job-status-badge ${job.status}">${JOB_STATUS_LABELS[job.status]}</span>
      </span>
      <span class="task-item-sub">${SEARCH_MODE_LABELS[job.mode]} · ${timeFmt.format(job.createdAt)}</span>
      <span class="task-item-tags">
        ${oosTag}${failTag}
        <span class="tag muted">${job.completedCount}/${job.totalCount}</span>
        <span class="tag time" data-elapsed="${job.id}">⏱ ${formatDuration(jobElapsedMs(job))}</span>
      </span>
    </button>
    <button type="button" class="task-del" data-del="${job.id}" title="删除任务" aria-label="删除任务：${escapeHtml(job.name)}">✕</button>
  </div>`
}

function renderSidebar(jobs: JobRecord[]): void {
  els.taskCount.textContent = String(jobs.length)
  if (jobs.length === 0) {
    els.taskList.innerHTML = '<p class="list-empty">还没有任务</p>'
    return
  }
  const collapsible = jobs.length > HISTORY_COLLAPSE_LIMIT
  const visible =
    collapsible && !historyExpanded ? jobs.slice(0, HISTORY_COLLAPSE_LIMIT) : jobs
  let html = visible.map(renderTaskItem).join('')
  if (collapsible) {
    const hidden = jobs.length - HISTORY_COLLAPSE_LIMIT
    const label = historyExpanded ? '收起' : `展开全部（+${hidden}）`
    html += `<button type="button" class="task-toggle" aria-expanded="${historyExpanded}">${label}</button>`
  }
  els.taskList.innerHTML = html
}

async function refreshSidebar(): Promise<void> {
  cachedJobs = await window.desktopPet.listJobs(1000)
  renderSidebar(cachedJobs)
}

async function selectJob(id: string): Promise<void> {
  selectedJobId = id
  renderSidebar(cachedJobs)
  const job = await window.desktopPet.getJob(id)
  await renderDetail(job)
}

async function deleteTask(id: string): Promise<void> {
  const job = cachedJobs.find((j) => j.id === id)
  const name = job?.name ?? '该任务'
  const running = job ? isActive(job.status) : false
  const message = running
    ? `任务「${name}」正在进行，删除会同时停止它。确定删除？`
    : `确定删除任务「${name}」？此操作不可恢复。`
  if (!window.confirm(message)) return

  const wasSelected = selectedJobId === id
  await window.desktopPet.deleteJob(id)
  await refreshSidebar()

  if (wasSelected) {
    selectedJobId = null
    selectedJob = null
    if (cachedJobs.length > 0) {
      await selectJob(cachedJobs[0].id)
    } else {
      renderSidebar(cachedJobs)
      showView('empty')
    }
  }
}

/* ---------- detail ---------- */
function renderStats(job: JobRecord): void {
  const percent =
    job.totalCount > 0
      ? Math.round((job.completedCount / job.totalCount) * 100)
      : 0
  els.progressBar.style.width = `${percent}%`
  els.progressText.textContent = `${percent}%`
  els.progress.setAttribute('aria-valuenow', String(percent))

  const hasOos = job.outOfStockCount > 0
  els.oosHero.classList.toggle('has-oos', hasOos)
  els.oosCount.textContent = String(job.outOfStockCount)
  els.btnCopyOos.disabled = !hasOos
  if (job.status === 'running' || job.status === 'pending') {
    els.oosSub.textContent = hasOos
      ? '查询进行中，已发现缺货，需重点处理'
      : '正在查询中…'
  } else {
    els.oosSub.textContent = hasOos
      ? '本批需要重点处理的缺货商品'
      : '本批未发现缺货'
  }

  els.jobStats.innerHTML = [
    ['total', '总计', job.totalCount],
    ['completed', '完成', job.completedCount],
    ['in', '有货', job.inStockCount],
    ['failed', '失败', job.failedCount]
  ]
    .map(
      ([tone, label, value]) =>
        `<div class="stat ${tone}"><strong>${value}</strong><span>${label}</span></div>`
    )
    .join('')
}

function badgeFor(item: ItemRecord): string {
  if (item.status === 'failed') return '<span class="badge fail">失败</span>'
  if (item.status === 'pending') return '<span class="badge pending">等待</span>'
  if (item.inStock) return '<span class="badge in">有货</span>'
  return '<span class="badge out">缺货</span>'
}

function rowClass(item: ItemRecord): string {
  if (item.status === 'failed') return 'fail'
  if (item.status === 'done' && item.inStock === false) return 'out'
  return ''
}

const COPY_ICON = `<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10" fill="none" stroke="currentColor" stroke-width="2"/></svg>`
const CHECK_ICON = `<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M5 12.5 10 17l9-10" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`
const LINK_ICON = `<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M14 5h5v5M19 5l-8 8M11 5H7a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`

function copyCell(value: string | null | undefined, empty = '—'): string {
  if (!value) return `<span class="cell-empty">${empty}</span>`
  return `<div class="copy-cell">
    <span class="cell-text mono" title="${escapeHtml(value)}">${escapeHtml(value)}</span>
    <button type="button" class="icon-btn" data-copy="${escapeHtml(value)}" title="复制" aria-label="复制">${COPY_ICON}</button>
  </div>`
}

function clampCell(value: string | null | undefined, empty = '—'): string {
  if (!value) return `<span class="cell-empty">${empty}</span>`
  return `<span class="clamp-text" title="${escapeHtml(value)}">${escapeHtml(value)}</span>`
}

function productUrlFor(item: ItemRecord): string | null {
  if (item.asin) return `https://www.amazon.co.jp/dp/${item.asin}`
  if (item.searchUrl && /^https?:\/\//i.test(item.searchUrl)) return item.searchUrl
  return null
}

function detailText(item: ItemRecord): string {
  const parts = [item.stockDetail || item.message, item.deliveryInfo].filter(
    Boolean
  ) as string[]
  return parts.join(' · ')
}

function renderItems(items: ItemRecord[], total: number, mode: SearchMode): void {
  if (items.length === 0) {
    els.results.innerHTML = '<div class="empty">该筛选下暂无结果</div>'
    return
  }
  const modeLabel = RESULT_MODE_LABELS[mode]
  const rows = items
    .map((item) => {
      const url = productUrlFor(item)
      const ab =
        mode === 'ab'
          ? `A${item.aInStock ? '✓' : '✗'}/B${item.bInStock ? '✓' : '✗'}`
          : item.stockStatus || ''
      return `<tr class="${rowClass(item)}">
        <td class="col-seq">#${item.seq}</td>
        <td class="col-asin">${copyCell(item.asin)}</td>
        <td class="col-price">${copyCell(item.price)}</td>
        <td class="col-stock">${badgeFor(item)}</td>
        <td class="col-mode"><span class="mode-tag">${escapeHtml(modeLabel)}</span>${ab ? `<div class="ab-mini">${escapeHtml(ab)}</div>` : ''}</td>
        <td class="col-title">${clampCell(item.title || item.input)}</td>
        <td class="col-detail">${clampCell(detailText(item))}</td>
        <td class="col-link">${
          url
            ? `<div class="link-actions">
                <button type="button" class="icon-btn" data-copy="${escapeHtml(url)}" title="复制链接" aria-label="复制链接">${COPY_ICON}</button>
                <button type="button" class="icon-btn link" data-open="${escapeHtml(url)}" title="在浏览器打开" aria-label="在浏览器打开">${LINK_ICON}</button>
              </div>`
            : '<span class="cell-empty">—</span>'
        }</td>
      </tr>`
    })
    .join('')
  const note =
    total > items.length
      ? `<div class="results-note">共 ${total} 条，已显示前 ${items.length} 条</div>`
      : ''
  els.results.innerHTML = `
    <div class="table-wrap">
      <table class="result-table">
        <thead>
          <tr>
            <th class="col-seq">#</th>
            <th class="col-asin">商品码</th>
            <th class="col-price">价格</th>
            <th class="col-stock">库存</th>
            <th class="col-mode">方式</th>
            <th class="col-title">标题</th>
            <th class="col-detail">详情</th>
            <th class="col-link">链接</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${note}`
}

async function reloadItems(job: JobRecord): Promise<void> {
  const { items, total } = await window.desktopPet.getJobItems(
    job.id,
    currentFilter,
    0,
    RESULT_LIMIT
  )
  renderItems(items, total, job.mode)
}

async function renderDetail(job: JobRecord | null): Promise<void> {
  if (!job) {
    selectedJob = null
    showView(cachedJobs.length === 0 ? 'empty' : 'create')
    return
  }
  selectedJob = job
  showView('detail')
  els.detailTitle.textContent = job.name
  els.detailMeta.innerHTML = `${SEARCH_MODE_LABELS[job.mode]} · 创建于 ${timeFmt.format(job.createdAt)} · 已处理 ${job.completedCount}/${job.totalCount} · 用时 <span id="detail-elapsed">${formatDuration(jobElapsedMs(job))}</span>`
  els.detailBadge.className = `job-status-badge ${job.status}`
  els.detailBadge.textContent = JOB_STATUS_LABELS[job.status]
  els.detailView.dataset.status = job.status

  els.btnPause.disabled = job.status !== 'running'
  els.btnResume.disabled = job.status !== 'paused'
  els.btnCancel.disabled = !isActive(job.status)

  renderStats(job)
  await reloadItems(job)
}

/* ---------- tools modal ---------- */
function openTools(): void {
  els.toolsModal.hidden = false
  els.transformIn.focus()
}

function closeTools(): void {
  els.toolsModal.hidden = true
}

/* ---------- events ---------- */
function bindEvents(): void {
  els.btnNewTask.addEventListener('click', showCreate)
  els.btnEmptyNew.addEventListener('click', showCreate)
  els.btnOpenTools.addEventListener('click', openTools)
  els.toolsClose.addEventListener('click', closeTools)
  els.toolsModal.addEventListener('click', (e) => {
    if (e.target === els.toolsModal) closeTools()
  })
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !els.toolsModal.hidden) closeTools()
  })

  els.modeBtns.forEach((btn) => {
    btn.addEventListener('click', () => setMode(btn.dataset.mode as SearchMode))
  })

  els.jobInput.addEventListener('input', () => {
    els.lineCount.textContent = `${countLines(els.jobInput.value)} 条`
  })

  els.btnStart.addEventListener('click', async () => {
    showCreateError(null)
    els.btnStart.disabled = true
    try {
      const result = await window.desktopPet.createJob({
        mode: currentMode,
        name: els.jobName.value,
        text: els.jobInput.value
      })
      if (!result.ok) {
        showCreateError(result.error || '创建失败')
        return
      }
      els.jobName.value = ''
      els.jobInput.value = ''
      els.lineCount.textContent = '0 条'
      await refreshSidebar()
      if (result.job) await selectJob(result.job.id)
    } finally {
      els.btnStart.disabled = false
    }
  })

  els.btnPause.addEventListener('click', () => {
    if (!selectedJobId) return
    void window.desktopPet.pauseJob(selectedJobId)
  })
  els.btnResume.addEventListener('click', () => {
    if (!selectedJobId) return
    void window.desktopPet.resumeJob(selectedJobId)
  })
  els.btnCancel.addEventListener('click', () => {
    if (!selectedJobId) return
    if (!window.confirm('确定取消当前查询吗？已完成的结果会保留。')) return
    void window.desktopPet.cancelJob(selectedJobId)
  })

  els.taskList.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    const del = target.closest<HTMLElement>('.task-del')
    if (del?.dataset.del) {
      void deleteTask(del.dataset.del)
      return
    }
    if (target.closest('.task-toggle')) {
      historyExpanded = !historyExpanded
      renderSidebar(cachedJobs)
      return
    }
    const btn = target.closest<HTMLElement>('.task-item')
    if (!btn?.dataset.id) return
    void selectJob(btn.dataset.id)
  })

  els.filterGroup.querySelectorAll<HTMLButtonElement>('.chip').forEach((chip) => {
    chip.addEventListener('click', async () => {
      currentFilter = chip.dataset.filter as ItemFilter
      els.filterGroup.querySelectorAll('.chip').forEach((c) => {
        const active = c === chip
        c.classList.toggle('active', active)
        c.setAttribute('aria-pressed', String(active))
      })
      if (selectedJobId) {
        const job = await window.desktopPet.getJob(selectedJobId)
        if (job) await reloadItems(job)
      }
    })
  })

  els.btnCopyOos.addEventListener('click', async () => {
    if (!selectedJobId) return
    const text = await window.desktopPet.exportOutOfStock(selectedJobId)
    if (!text) return
    await navigator.clipboard.writeText(text)
    void flash(els.btnCopyOos, '已复制缺货')
  })

  els.btnCopyFailed.addEventListener('click', async () => {
    if (!selectedJobId) return
    const text = await window.desktopPet.exportFailed(selectedJobId)
    if (!text) {
      void flash(els.btnCopyFailed, '无失败项')
      return
    }
    await navigator.clipboard.writeText(text)
    void flash(els.btnCopyFailed, '已复制')
  })

  els.results.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    const copyBtn = target.closest<HTMLButtonElement>('[data-copy]')
    if (copyBtn?.dataset.copy) {
      e.preventDefault()
      void navigator.clipboard.writeText(copyBtn.dataset.copy).then(() => {
        copyBtn.classList.add('copied')
        copyBtn.innerHTML = CHECK_ICON
        copyBtn.title = '已复制'
        window.setTimeout(() => {
          copyBtn.classList.remove('copied')
          copyBtn.innerHTML = COPY_ICON
          copyBtn.title = '复制'
        }, 1200)
      })
      return
    }
    const openBtn = target.closest<HTMLButtonElement>('[data-open]')
    if (openBtn?.dataset.open) {
      e.preventDefault()
      const url = openBtn.dataset.open
      void window.desktopPet.openExternal(url).catch((err: unknown) => {
        console.error('openExternal failed', err)
        window.alert(
          `无法打开浏览器：${err instanceof Error ? err.message : String(err)}`
        )
      })
    }
  })

  els.btnTransform.addEventListener('click', async () => {
    const result = await window.desktopPet.transformCodes(els.transformIn.value)
    els.transformOut.value = result.outputText
    els.transformCount.textContent = `成功 ${result.successCount} · 失败 ${result.errorCount}`
  })

  els.btnTransformCopy.addEventListener('click', async () => {
    if (!els.transformOut.value) return
    await navigator.clipboard.writeText(els.transformOut.value)
    void flash(els.btnTransformCopy, '已复制')
  })

  window.desktopPet.onJobUpdated(async (job) => {
    await refreshSidebar()
    if (job && job.id === selectedJobId) {
      await renderDetail(job)
    }
  })
}

/** 每秒刷新运行中任务的执行时长，避免整块重渲染。 */
function tickElapsed(): void {
  for (const job of cachedJobs) {
    if (job.status !== 'running') continue
    const el = els.taskList.querySelector(`[data-elapsed="${job.id}"]`)
    if (el) el.textContent = `⏱ ${formatDuration(jobElapsedMs(job))}`
  }
  if (selectedJob?.status === 'running') {
    const el = document.getElementById('detail-elapsed')
    if (el) el.textContent = formatDuration(jobElapsedMs(selectedJob))
  }
}

async function bootstrap(): Promise<void> {
  setMode('a')
  bindEvents()
  window.setInterval(tickElapsed, 1000)
  await refreshSidebar()
  const active =
    cachedJobs.find((job) => job.status === 'running') ||
    cachedJobs.find((job) => job.status === 'paused') ||
    cachedJobs.find((job) => job.status === 'pending')
  if (active) {
    await selectJob(active.id)
  } else {
    showCreate()
  }
}

void bootstrap()
