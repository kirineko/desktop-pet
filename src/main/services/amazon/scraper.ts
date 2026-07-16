import { net, session } from 'electron'
import type {
  CheckResult,
  NetworkStatus,
  SearchMode
} from '../../../shared/types'
import {
  getAmazonHost,
  normalizeForMode,
  stockStatusLabel,
  type NormalizedInput
} from './normalize'
import { isSoftBlockedHtml, parseASearchPage, parseBSearchPage } from './parse'

const REQUEST_INTERVAL_MS = Number(process.env.AMAZON_REQUEST_INTERVAL || 1.8) * 1000
const REQUEST_JITTER_MS = Number(process.env.AMAZON_REQUEST_JITTER || 0.8) * 1000
const MAX_RETRIES = Number(process.env.AMAZON_MAX_RETRIES || 3)
const RETRY_BASE_DELAY_MS = Number(process.env.AMAZON_RETRY_DELAY || 2) * 1000
const SESSION_REFRESH_EVERY = Number(process.env.AMAZON_SESSION_REFRESH || 40)
const RETRIABLE_STATUS = new Set([429, 500, 502, 503, 504])
const PROXY_PROBE_URL = 'https://www.amazon.co.jp'

const REQUEST_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7',
  'Accept-Encoding': 'gzip, deflate, br',
  Connection: 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"'
}

export class SoftBlockError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SoftBlockError'
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function cookieHeader(jar: Map<string, string>): string {
  return Array.from(jar.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join('; ')
}

function absorbSetCookie(
  jar: Map<string, string>,
  response: Response
): void {
  const anyHeaders = response.headers as Headers & {
    getSetCookie?: () => string[]
  }
  const list =
    typeof anyHeaders.getSetCookie === 'function'
      ? anyHeaders.getSetCookie()
      : []
  const single = response.headers.get('set-cookie')
  const cookies = list.length > 0 ? list : single ? [single] : []
  for (const raw of cookies) {
    const part = raw.split(';')[0]
    const eq = part.indexOf('=')
    if (eq > 0) {
      jar.set(part.slice(0, eq).trim(), part.slice(eq + 1).trim())
    }
  }
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
  private cookieJar = new Map<string, string>()
  private requestCount = 0
  private host = 'www.amazon.co.jp'
  private warmed = false

  async getNetworkStatus(): Promise<NetworkStatus> {
    try {
      const proxyInfo = await session.defaultSession.resolveProxy(PROXY_PROBE_URL)
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

  resetSession(): void {
    this.cookieJar.clear()
    this.requestCount = 0
    this.warmed = false
  }

  private async warmUp(host: string): Promise<void> {
    try {
      // 预热仅尝试一次，避免代理不可用时叠加完整重试导致长时间无响应。
      // 使用 net.fetch，走 Chromium 网络栈，自动使用系统代理 / PAC。
      const response = await net.fetch(`https://${host}/`, {
        headers: REQUEST_HEADERS,
        redirect: 'follow',
        signal: AbortSignal.timeout(8000)
      })
      absorbSetCookie(this.cookieJar, response)
      await sleep(200 + Math.random() * 300)
      this.warmed = response.ok
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
        const headers: Record<string, string> = { ...REQUEST_HEADERS }
        const cookie = cookieHeader(this.cookieJar)
        if (cookie) headers.Cookie = cookie
        if (referer) {
          headers.Referer = referer
          headers['Sec-Fetch-Site'] = 'same-origin'
        }

        const response = await net.fetch(url, {
          headers,
          redirect: 'follow',
          signal: AbortSignal.timeout(20000)
        })

        absorbSetCookie(this.cookieJar, response)
        const html = await response.text()

        if (
          RETRIABLE_STATUS.has(response.status) ||
          isSoftBlockedHtml(html)
        ) {
          lastError = new SoftBlockError(
            `${response.status} Amazon anti-bot / soft block`
          )
          continue
        }

        if (!response.ok) {
          lastError = new Error(`HTTP ${response.status}`)
          continue
        }

        this.requestCount += 1
        if (this.requestCount % SESSION_REFRESH_EVERY === 0) {
          this.resetSession()
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
