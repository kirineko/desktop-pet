import type {
  CheckResult,
  NetworkStatus,
  SearchMode
} from '../../../shared/types'
import {
  disposeAmazonBrowser,
  getAmazonBrowser,
  getAmazonSession
} from './browser'
import {
  getAmazonHost,
  normalizeForMode,
  stockStatusLabel,
  type NormalizedInput
} from './normalize'
import { isSoftBlockedHtml, parseASearchPage, parseBSearchPage } from './parse'

const REQUEST_INTERVAL_MS = Number(process.env.AMAZON_REQUEST_INTERVAL || 3.0) * 1000
const REQUEST_JITTER_MS = Number(process.env.AMAZON_REQUEST_JITTER || 1.2) * 1000
const MAX_RETRIES = Number(process.env.AMAZON_MAX_RETRIES || 3)
const RETRY_BASE_DELAY_MS = Number(process.env.AMAZON_RETRY_DELAY || 2) * 1000
const SESSION_REFRESH_EVERY = Number(process.env.AMAZON_SESSION_REFRESH || 40)
const PROXY_PROBE_URL = 'https://www.amazon.co.jp'

export class SoftBlockError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SoftBlockError'
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** 解析 Chromium resolveProxy 结果，例如 "PROXY 127.0.0.1:7897; DIRECT" */
export function describeResolvedProxy(proxyInfo: string): NetworkStatus {
  const first = proxyInfo.split(';')[0]?.trim() || ''
  if (!first || /^DIRECT$/i.test(first)) {
    return {
      mode: 'missing',
      label: '未检测到代理，Amazon JP 可能无法访问'
    }
  }

  const match = first.match(/^(PROXY|SOCKS5?|HTTPS)\s+(.+)$/i)
  if (match) {
    return {
      mode: 'proxy',
      label: `已启用系统代理 ${match[2]}`
    }
  }

  return {
    mode: 'proxy',
    label: '已启用系统代理'
  }
}

export class AmazonScraper {
  private requestCount = 0
  private host = 'www.amazon.co.jp'
  private warmed = false

  async getNetworkStatus(): Promise<NetworkStatus> {
    try {
      const proxyInfo = await getAmazonSession().resolveProxy(PROXY_PROBE_URL)
      return describeResolvedProxy(proxyInfo)
    } catch {
      return {
        mode: 'missing',
        label: '未检测到代理，Amazon JP 可能无法访问'
      }
    }
  }

  async throttle(): Promise<void> {
    const delay =
      REQUEST_INTERVAL_MS + Math.random() * REQUEST_JITTER_MS
    await sleep(delay)
  }

  async resetSession(): Promise<void> {
    this.requestCount = 0
    this.warmed = false
    await getAmazonBrowser().reset()
  }

  dispose(): void {
    disposeAmazonBrowser()
  }

  private async warmUp(host: string): Promise<void> {
    // 预热仅尝试一次，避免代理不可用时叠加完整重试导致长时间无响应。
    try {
      this.warmed = await getAmazonBrowser().warmUp(host)
    } catch {
      // warm-up failure is non-fatal
    }
  }

  private async fetchHtml(
    url: string,
    host: string,
    referer?: string
  ): Promise<string> {
    let lastError: Error | null = null

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        const delay =
          RETRY_BASE_DELAY_MS * 2 ** (attempt - 1) +
          500 +
          Math.random() * 1000
        await sleep(delay)
        try {
          await this.warmUp(host)
        } catch {
          // ignore
        }
      }

      try {
        const html = await getAmazonBrowser().navigate(url, {
          referrer: referer,
          retrySoftBlock: true
        })

        if (isSoftBlockedHtml(html)) {
          lastError = new SoftBlockError('Amazon anti-bot / soft block')
          continue
        }

        this.requestCount += 1
        if (this.requestCount % SESSION_REFRESH_EVERY === 0) {
          await this.resetSession()
        }
        return html
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err))
      }
    }

    if (lastError instanceof SoftBlockError || lastError?.name === 'SoftBlockError') {
      throw new SoftBlockError(
        `亚马逊触发了反爬限制，已自动重试仍失败。请暂停任务等待几分钟后再继续（当前间隔约 ${(REQUEST_INTERVAL_MS / 1000).toFixed(1)} 秒）。`
      )
    }

    throw new Error(
      `无法访问亚马逊页面，请检查网络连接或稍后重试。详情：${lastError?.message || lastError}`
    )
  }

  private async checkA(
    normalized: NormalizedInput
  ): Promise<{ inStock: boolean; message: string }> {
    const host = getAmazonHost(normalized.productUrl)
    this.host = host
    if (!this.warmed) await this.warmUp(host)
    const html = await this.fetchHtml(
      normalized.productUrl,
      host,
      `https://${host}/`
    )
    const parsed = parseASearchPage(html, normalized.asin)
    return { inStock: parsed.inStock, message: parsed.message }
  }

  private async checkB(
    normalized: NormalizedInput
  ): Promise<{ inStock: boolean; message: string; searchUrl: string }> {
    const host = getAmazonHost(normalized.productUrl)
    this.host = host
    const searchUrl = `https://${host}/s?k=${normalized.asin}`
    if (!this.warmed) await this.warmUp(host)
    const html = await this.fetchHtml(searchUrl, host, `https://${host}/`)
    const parsed = parseBSearchPage(html, normalized.asin)
    return { ...parsed, searchUrl }
  }

  async check(
    rawInput: string,
    mode: SearchMode
  ): Promise<CheckResult> {
    let normalized: NormalizedInput
    try {
      normalized = normalizeForMode(rawInput, mode)
    } catch (err) {
      return {
        success: false,
        inStock: null,
        message: err instanceof Error ? err.message : String(err)
      }
    }

    try {
      let aInStock: boolean | undefined
      let bInStock: boolean | undefined
      let message: string | undefined
      let searchUrl = normalized.productUrl

      if (mode === 'a' || mode === 'ab') {
        const a = await this.checkA(normalized)
        aInStock = a.inStock
        message = a.message
      }

      if (mode === 'ab') {
        await this.throttle()
      }

      if (mode === 'b' || mode === 'ab') {
        const b = await this.checkB(normalized)
        bInStock = b.inStock
        searchUrl = b.searchUrl
        if (mode === 'b') message = b.message
      }

      let inStock: boolean
      if (mode === 'a') inStock = Boolean(aInStock)
      else if (mode === 'b') inStock = Boolean(bInStock)
      else inStock = Boolean(aInStock) && Boolean(bInStock)

      return {
        success: true,
        inStock,
        asin: normalized.asin,
        aInStock,
        bInStock,
        stockStatus: stockStatusLabel(aInStock ?? null, bInStock ?? null, mode),
        message,
        searchUrl
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const soft = err instanceof SoftBlockError
      return {
        success: false,
        inStock: null,
        asin: normalized.asin,
        message,
        searchUrl: normalized.productUrl,
        // mark soft-block via message prefix for queue auto-pause
        stockStatus: soft ? '__soft_block__' : undefined
      }
    }
  }
}
