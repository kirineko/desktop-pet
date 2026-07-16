import type { SessionSummary } from '../shared/types'
import { EMPTY_SESSION_SUMMARY } from '../shared/types'

export class SessionHud {
  private hud: HTMLElement
  private chipProgress: HTMLElement
  private chipIssues: HTMLElement
  private detail: HTMLElement
  private detailTitle: HTMLElement
  private detailCount: HTMLElement
  private detailProgress: HTMLElement
  private detailStatus: HTMLElement
  private detailIn: HTMLElement
  private detailOut: HTMLElement
  private detailFail: HTMLElement
  private hideTimer: number | null = null
  private summary: SessionSummary = { ...EMPTY_SESSION_SUMMARY }

  constructor() {
    this.hud = document.getElementById('session-hud') as HTMLElement
    this.chipProgress = document.getElementById(
      'session-chip-progress'
    ) as HTMLElement
    this.chipIssues = document.getElementById(
      'session-chip-issues'
    ) as HTMLElement
    this.detail = document.getElementById('session-detail') as HTMLElement
    this.detailTitle = document.getElementById(
      'session-detail-title'
    ) as HTMLElement
    this.detailCount = document.getElementById(
      'session-detail-count'
    ) as HTMLElement
    this.detailProgress = document.getElementById(
      'session-detail-progress'
    ) as HTMLElement
    this.detailStatus = document.getElementById(
      'session-detail-status'
    ) as HTMLElement
    this.detailIn = document.getElementById('session-detail-in') as HTMLElement
    this.detailOut = document.getElementById('session-detail-out') as HTMLElement
    this.detailFail = document.getElementById(
      'session-detail-fail'
    ) as HTMLElement

    this.hud.addEventListener('mouseenter', () => this.showDetail())
    this.hud.addEventListener('mouseleave', () => this.scheduleHideDetail())
    this.detail.addEventListener('mouseenter', () => this.showDetail())
    this.detail.addEventListener('mouseleave', () => this.scheduleHideDetail())
  }

  getSummary(): SessionSummary {
    return this.summary
  }

  update(summary: SessionSummary): void {
    this.summary = summary
    if (!summary.hasJob) {
      this.hud.classList.add('hidden')
      this.hideDetail()
      return
    }

    this.hud.classList.remove('hidden')
    this.hud.dataset.status = summary.status
    this.chipProgress.textContent = `${summary.completedCount}/${summary.totalCount} · ${summary.percent}%`
    this.chipIssues.textContent = `无货 ${summary.outOfStockCount} · 失败 ${summary.failedCount}`

    this.detailTitle.textContent = summary.jobName
    this.detailCount.textContent = `${summary.jobCount} 个`
    this.detailProgress.textContent = `${summary.completedCount}/${summary.totalCount}（${summary.percent}%）`
    this.detailStatus.textContent = summary.statusLabel
    this.detailIn.textContent = String(summary.inStockCount)
    this.detailOut.textContent = String(summary.outOfStockCount)
    this.detailFail.textContent = String(summary.failedCount)
  }

  private showDetail(): void {
    if (this.hideTimer != null) {
      window.clearTimeout(this.hideTimer)
      this.hideTimer = null
    }
    if (!this.summary.hasJob) return
    this.detail.hidden = false
  }

  private scheduleHideDetail(): void {
    if (this.hideTimer != null) window.clearTimeout(this.hideTimer)
    this.hideTimer = window.setTimeout(() => this.hideDetail(), 120)
  }

  private hideDetail(): void {
    if (this.hideTimer != null) {
      window.clearTimeout(this.hideTimer)
      this.hideTimer = null
    }
    this.detail.hidden = true
  }
}
