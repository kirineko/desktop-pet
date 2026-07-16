import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { fetchMock, resolveProxyMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  resolveProxyMock: vi.fn()
}))

vi.mock('electron', () => ({
  net: {
    fetch: fetchMock
  },
  session: {
    defaultSession: {
      resolveProxy: resolveProxyMock
    }
  }
}))

import { AmazonScraper, describeResolvedProxy } from './scraper'

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

describe('AmazonScraper proxy routing', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    resolveProxyMock.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('uses electron net.fetch for Amazon requests', async () => {
    fetchMock.mockResolvedValue(new Response('<html>productTitle</html>'))
    const scraper = new AmazonScraper()

    await (
      scraper as unknown as {
        fetchHtml: (url: string, host: string) => Promise<string>
      }
    ).fetchHtml('https://www.amazon.co.jp/', 'www.amazon.co.jp')

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock.mock.calls[0][0]).toBe('https://www.amazon.co.jp/')
    expect(fetchMock.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        redirect: 'follow',
        signal: expect.any(AbortSignal)
      })
    )
    expect(fetchMock.mock.calls[0][1]).not.toHaveProperty('dispatcher')
  })

  it('reports Chromium-resolved system proxy status', async () => {
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

  it('uses only one best-effort request when session warm-up fails', async () => {
    vi.useFakeTimers()
    fetchMock.mockRejectedValue(new Error('proxy unavailable'))
    const scraper = new AmazonScraper()

    const warming = (
      scraper as unknown as { warmUp: (host: string) => Promise<void> }
    ).warmUp('www.amazon.co.jp')
    await vi.runAllTimersAsync()
    await warming

    expect(fetchMock).toHaveBeenCalledOnce()
  })
})
