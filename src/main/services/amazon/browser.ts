import { BrowserWindow, session, type Session } from 'electron'
import { isSoftBlockedHtml } from './parse'

export const AMAZON_PARTITION = 'persist:amazon-jp'
export const AMAZON_CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const DEFAULT_NAV_TIMEOUT_MS = 25_000
const WARMUP_NAV_TIMEOUT_MS = 8_000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function getAmazonSession(): Session {
  return session.fromPartition(AMAZON_PARTITION)
}

export type NavigateOptions = {
  referrer?: string
  timeoutMs?: number
  /** soft-block 时是否等待后重读 HTML（真实浏览器有时能过轻量验证） */
  retrySoftBlock?: boolean
  /**
   * 导航完成后等待关键 DOM 选择器（任一命中即可）。
   * 用于等 Amazon 水合标题/价格，避免 did-finish-load 过早取 HTML。
   */
  waitForAny?: string[]
  waitForMs?: number
}

/**
 * 隐藏 BrowserWindow + 持久 Session，用真实页面导航访问 Amazon。
 * 进程内单例，JobQueue 串行调用天然适配。
 */
export class AmazonBrowser {
  private window: BrowserWindow | null = null
  private queue: Promise<unknown> = Promise.resolve()

  private ensureWindow(): BrowserWindow {
    if (this.window && !this.window.isDestroyed()) {
      return this.window
    }

    const ses = getAmazonSession()
    const win = new BrowserWindow({
      show: false,
      width: 1280,
      height: 800,
      skipTaskbar: true,
      paintWhenInitiallyHidden: true,
      webPreferences: {
        session: ses,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false
      }
    })
    win.webContents.setUserAgent(AMAZON_CHROME_UA)
    win.on('closed', () => {
      if (this.window === win) this.window = null
    })
    this.window = win
    return win
  }

  /** 串行化导航，避免并发 loadURL 互相打断 */
  navigate(url: string, options: NavigateOptions = {}): Promise<string> {
    const run = this.queue.then(() => this.doNavigate(url, options))
    this.queue = run.then(
      () => undefined,
      () => undefined
    )
    return run
  }

  private async waitForDom(
    selectors: string[],
    timeoutMs: number
  ): Promise<void> {
    if (selectors.length === 0) return
    const win = this.ensureWindow()
    try {
      await win.webContents.executeJavaScript(
        `(() => {
          const selectors = ${JSON.stringify(selectors)};
          const timeoutMs = ${Math.max(0, timeoutMs)};
          return new Promise((resolve) => {
            const started = Date.now();
            const tick = () => {
              if (selectors.some((s) => document.querySelector(s))) {
                resolve(true);
                return;
              }
              if (Date.now() - started >= timeoutMs) {
                resolve(false);
                return;
              }
              setTimeout(tick, 200);
            };
            tick();
          });
        })()`
      )
    } catch {
      // ignore wait failures; caller still reads whatever HTML is available
    }
  }

  private async doNavigate(
    url: string,
    options: NavigateOptions
  ): Promise<string> {
    const {
      referrer,
      timeoutMs = DEFAULT_NAV_TIMEOUT_MS,
      retrySoftBlock = true,
      waitForAny = [],
      waitForMs = 8_000
    } = options
    const win = this.ensureWindow()
    const wc = win.webContents

    await new Promise<void>((resolve, reject) => {
      let settled = false
      const timer = setTimeout(() => {
        finish(() => reject(new Error(`导航超时（${timeoutMs}ms）：${url}`)))
      }, timeoutMs)

      const onFinish = (): void => {
        finish(() => resolve())
      }

      const onFail = (
        _event: Electron.Event,
        errorCode: number,
        errorDescription: string,
        _validatedURL: string,
        isMainFrame: boolean
      ): void => {
        if (!isMainFrame) return
        // -3 ERR_ABORTED：常见于重定向打断，若随后 finish-load 仍会成功
        if (errorCode === -3) return
        finish(() =>
          reject(new Error(`导航失败（${errorCode}）：${errorDescription}`))
        )
      }

      const finish = (cb: () => void): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        wc.removeListener('did-finish-load', onFinish)
        wc.removeListener('did-fail-load', onFail)
        cb()
      }

      wc.on('did-finish-load', onFinish)
      wc.on('did-fail-load', onFail)

      const loadOptions = referrer ? { httpReferrer: referrer } : undefined
      void wc.loadURL(url, loadOptions).catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err)
        if (/ERR_ABORTED|-3/i.test(message)) return
        finish(() => reject(err instanceof Error ? err : new Error(message)))
      })
    })

    await this.waitForDom(waitForAny, waitForMs)

    let html = (await wc.executeJavaScript(
      'document.documentElement.outerHTML'
    )) as string

    if (retrySoftBlock && isSoftBlockedHtml(html)) {
      await sleep(2000 + Math.random() * 2000)
      await this.waitForDom(waitForAny, Math.min(waitForMs, 4_000))
      html = (await wc.executeJavaScript(
        'document.documentElement.outerHTML'
      )) as string
    }

    return html
  }

  async warmUp(host: string): Promise<boolean> {
    try {
      const html = await this.navigate(`https://${host}/`, {
        timeoutMs: WARMUP_NAV_TIMEOUT_MS,
        retrySoftBlock: false
      })
      await sleep(200 + Math.random() * 300)
      return html.length > 0 && !isSoftBlockedHtml(html)
    } catch {
      return false
    }
  }

  async reset(): Promise<void> {
    this.destroy()
    try {
      await getAmazonSession().clearStorageData()
    } catch {
      // ignore clear failures
    }
  }

  destroy(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.destroy()
    }
    this.window = null
  }
}

let sharedBrowser: AmazonBrowser | null = null

export function getAmazonBrowser(): AmazonBrowser {
  if (!sharedBrowser) {
    sharedBrowser = new AmazonBrowser()
  }
  return sharedBrowser
}

export function disposeAmazonBrowser(): void {
  if (sharedBrowser) {
    sharedBrowser.destroy()
    sharedBrowser = null
  }
}
