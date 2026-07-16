import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  resolveProxyMock,
  clearStorageDataMock,
  loadURLMock,
  executeJavaScriptMock,
  setUserAgentMock,
  webContentsOnMock,
  webContentsRemoveListenerMock,
  destroyMock
} = vi.hoisted(() => ({
  resolveProxyMock: vi.fn(),
  clearStorageDataMock: vi.fn(async () => undefined),
  loadURLMock: vi.fn(async () => undefined),
  executeJavaScriptMock: vi.fn(),
  setUserAgentMock: vi.fn(),
  webContentsOnMock: vi.fn(),
  webContentsRemoveListenerMock: vi.fn(),
  destroyMock: vi.fn()
}))

vi.mock('electron', () => {
  class MockBrowserWindow {
    webContents = {
      setUserAgent: setUserAgentMock,
      loadURL: loadURLMock,
      executeJavaScript: executeJavaScriptMock,
      on: webContentsOnMock,
      removeListener: webContentsRemoveListenerMock
    }

    on = vi.fn()
    isDestroyed = () => false
    destroy = destroyMock
  }

  return {
    BrowserWindow: MockBrowserWindow,
    session: {
      fromPartition: () => ({
        resolveProxy: resolveProxyMock,
        clearStorageData: clearStorageDataMock
      })
    }
  }
})

import {
  disposeAmazonBrowser,
  getAmazonBrowser
} from './browser'
import { AmazonScraper, describeResolvedProxy } from './scraper'

function armSuccessfulNavigation(html: string): void {
  webContentsOnMock.mockImplementation(
    (event: string, handler: (...args: unknown[]) => void) => {
      if (event === 'did-finish-load') {
        queueMicrotask(() => handler())
      }
    }
  )
  executeJavaScriptMock.mockResolvedValue(html)
}

describe('describeResolvedProxy', () => {
  it('reports system proxy host without credentials', () => {
    expect(describeResolvedProxy('PROXY 127.0.0.1:7897')).toEqual({
      mode: 'proxy',
      label: '已启用系统代理 127.0.0.1:7897'
    })
  })

  it('uses the first proxy entry when Chromium returns a failover list', () => {
    expect(describeResolvedProxy('PROXY 127.0.0.1:7897; DIRECT')).toEqual({
      mode: 'proxy',
      label: '已启用系统代理 127.0.0.1:7897'
    })
  })

  it('warns when Chromium resolves to DIRECT', () => {
    expect(describeResolvedProxy('DIRECT')).toEqual({
      mode: 'missing',
      label: '未检测到代理，Amazon JP 可能无法访问'
    })
  })
})

describe('AmazonBrowser navigation', () => {
  beforeEach(() => {
    disposeAmazonBrowser()
    resolveProxyMock.mockReset()
    clearStorageDataMock.mockReset().mockResolvedValue(undefined)
    loadURLMock.mockReset().mockResolvedValue(undefined)
    executeJavaScriptMock.mockReset()
    setUserAgentMock.mockReset()
    webContentsOnMock.mockReset()
    webContentsRemoveListenerMock.mockReset()
    destroyMock.mockReset()
  })

  afterEach(() => {
    disposeAmazonBrowser()
    vi.useRealTimers()
  })

  it('loads Amazon pages via hidden BrowserWindow navigation', async () => {
    armSuccessfulNavigation('<html><body id="productTitle">ok</body></html>')
    const html = await getAmazonBrowser().navigate(
      'https://www.amazon.co.jp/dp/B000000000',
      { referrer: 'https://www.amazon.co.jp/', retrySoftBlock: false }
    )

    expect(loadURLMock).toHaveBeenCalledWith(
      'https://www.amazon.co.jp/dp/B000000000',
      { httpReferrer: 'https://www.amazon.co.jp/' }
    )
    expect(setUserAgentMock).toHaveBeenCalled()
    expect(html).toContain('productTitle')
  })

  it('re-reads HTML after a short wait when soft-blocked', async () => {
    vi.useFakeTimers()
    webContentsOnMock.mockImplementation(
      (event: string, handler: (...args: unknown[]) => void) => {
        if (event === 'did-finish-load') {
          queueMicrotask(() => handler())
        }
      }
    )
    executeJavaScriptMock
      .mockResolvedValueOnce('<html>bm-verify challenge</html>')
      .mockResolvedValueOnce(
        '<html><span id="productTitle">Recovered</span></html>'
      )

    const navigating = getAmazonBrowser().navigate(
      'https://www.amazon.co.jp/dp/B000000000',
      { retrySoftBlock: true }
    )
    await vi.runAllTimersAsync()
    const html = await navigating

    expect(executeJavaScriptMock).toHaveBeenCalledTimes(2)
    expect(html).toContain('productTitle')
  })
})

describe('AmazonScraper proxy and warm-up', () => {
  beforeEach(() => {
    disposeAmazonBrowser()
    resolveProxyMock.mockReset()
    clearStorageDataMock.mockReset().mockResolvedValue(undefined)
    loadURLMock.mockReset().mockResolvedValue(undefined)
    executeJavaScriptMock.mockReset()
    setUserAgentMock.mockReset()
    webContentsOnMock.mockReset()
    webContentsRemoveListenerMock.mockReset()
    destroyMock.mockReset()
  })

  afterEach(() => {
    disposeAmazonBrowser()
    vi.useRealTimers()
  })

  it('reports Chromium-resolved system proxy status via amazon session', async () => {
    resolveProxyMock.mockResolvedValue('PROXY 127.0.0.1:7897')
    const scraper = new AmazonScraper()

    await expect(scraper.getNetworkStatus()).resolves.toEqual({
      mode: 'proxy',
      label: '已启用系统代理 127.0.0.1:7897'
    })
    expect(resolveProxyMock).toHaveBeenCalledWith('https://www.amazon.co.jp')
  })

  it('warns when Chromium has no proxy for Amazon JP', async () => {
    resolveProxyMock.mockResolvedValue('DIRECT')
    const scraper = new AmazonScraper()

    await expect(scraper.getNetworkStatus()).resolves.toEqual({
      mode: 'missing',
      label: '未检测到代理，Amazon JP 可能无法访问'
    })
  })

  it('uses only one best-effort navigation when session warm-up fails', async () => {
    vi.useFakeTimers()
    loadURLMock.mockRejectedValue(new Error('proxy unavailable'))
    webContentsOnMock.mockImplementation(
      (event: string, handler: (...args: unknown[]) => void) => {
        if (event === 'did-fail-load') {
          queueMicrotask(() =>
            handler({}, -101, 'proxy unavailable', 'https://x', true)
          )
        }
      }
    )
    const scraper = new AmazonScraper()

    const warming = (
      scraper as unknown as { warmUp: (host: string) => Promise<void> }
    ).warmUp('www.amazon.co.jp')
    await vi.runAllTimersAsync()
    await warming

    expect(loadURLMock).toHaveBeenCalledOnce()
  })

  it('fetches product HTML through browser navigate instead of net.fetch', async () => {
    armSuccessfulNavigation(
      '<html><body><span id="productTitle">Item</span></body></html>'
    )
    const scraper = new AmazonScraper()

    const html = await (
      scraper as unknown as {
        fetchHtml: (url: string, host: string) => Promise<string>
      }
    ).fetchHtml('https://www.amazon.co.jp/dp/B000000000', 'www.amazon.co.jp')

    expect(html).toContain('productTitle')
    expect(loadURLMock).toHaveBeenCalled()
  })
})
