import { afterEach, describe, expect, it, vi } from 'vitest'
import { AmazonScraper } from './scraper'

describe('AmazonScraper proxy routing', () => {
  const originalHttpsProxy = process.env.HTTPS_PROXY
  const originalHttpProxy = process.env.HTTP_PROXY

  afterEach(() => {
    vi.useRealTimers()
    if (originalHttpsProxy === undefined) {
      delete process.env.HTTPS_PROXY
    } else {
      process.env.HTTPS_PROXY = originalHttpsProxy
    }
    if (originalHttpProxy === undefined) {
      delete process.env.HTTP_PROXY
    } else {
      process.env.HTTP_PROXY = originalHttpProxy
    }
    vi.unstubAllGlobals()
  })

  it('attaches an environment proxy dispatcher to Amazon fetches', async () => {
    process.env.HTTPS_PROXY = 'http://127.0.0.1:7890'
    const fetchMock = vi.fn(async () => new Response('<html>productTitle</html>'))
    vi.stubGlobal('fetch', fetchMock)
    const scraper = new AmazonScraper()

    await (
      scraper as unknown as {
        fetchHtml: (url: string, host: string) => Promise<string>
      }
    ).fetchHtml('https://www.amazon.co.jp/', 'www.amazon.co.jp')

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock.mock.calls[0][1]).toEqual(
      expect.objectContaining({ dispatcher: expect.anything() })
    )
  })

  it('reports which proxy environment variable is active without exposing its value', () => {
    process.env.HTTPS_PROXY = 'http://user:secret@127.0.0.1:7890'
    const scraper = new AmazonScraper()

    expect(scraper.getNetworkStatus()).toEqual({
      mode: 'proxy',
      label: '已启用 HTTPS_PROXY'
    })
  })

  it('warns when no HTTP proxy environment variable is available', () => {
    delete process.env.HTTPS_PROXY
    delete process.env.HTTP_PROXY
    delete process.env.https_proxy
    delete process.env.http_proxy
    const scraper = new AmazonScraper()

    expect(scraper.getNetworkStatus()).toEqual({
      mode: 'missing',
      label: '未检测到代理，Amazon JP 可能无法访问'
    })
  })

  it('uses only one best-effort request when session warm-up fails', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn(async () => {
      throw new Error('proxy unavailable')
    })
    vi.stubGlobal('fetch', fetchMock)
    const scraper = new AmazonScraper()

    const warming = (
      scraper as unknown as { warmUp: (host: string) => Promise<void> }
    ).warmUp('www.amazon.co.jp')
    await vi.runAllTimersAsync()
    await warming

    expect(fetchMock).toHaveBeenCalledOnce()
  })
})
