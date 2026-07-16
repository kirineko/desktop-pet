import * as cheerio from 'cheerio'

const B_SEARCH_NO_RESULT_KEYWORDS = [
  '您的搜索查询无结果',
  '搜索查询无结果',
  '検索クエリに一致する結果はありません',
  '検索に一致する商品はありません',
  'did not match any products',
  'no results for'
]

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

export function isSoftBlockedHtml(html: string): boolean {
  const lowered = html.toLowerCase()
  if (lowered.includes('bm-verify') || lowered.includes('/_sec/verify')) {
    return true
  }
  if (
    lowered.includes('captchacharacters') ||
    lowered.includes('/errors/validatecaptcha')
  ) {
    return true
  }
  if (html.length < 5000) {
    if (
      !lowered.includes('producttitle') &&
      !lowered.includes('s-main-slot')
    ) {
      return true
    }
  }
  return false
}

export function isAPageBlocked(
  html: string,
  $: ReturnType<typeof cheerio.load>
): boolean {
  const lowered = html.toLowerCase()
  if (
    lowered.includes('captchacharacters') ||
    lowered.includes('/errors/validatecaptcha')
  ) {
    return true
  }
  if ($('#productTitle').length === 0 && html.length < 100000) {
    return true
  }
  return false
}

function extractPageAsin(
  $: ReturnType<typeof cheerio.load>,
  html: string
): string | null {
  for (const selector of ['#dp', '#ASIN', 'input[name="ASIN"]']) {
    const el = $(selector).first()
    if (el.length) {
      const value = (
        el.attr('value') ||
        el.attr('data-asin') ||
        ''
      ).trim()
      if (/^[A-Z0-9]{10}$/i.test(value)) {
        return value.toUpperCase()
      }
    }
  }
  const current = /"currentAsin"\s*:\s*"([A-Z0-9]{10})"/i.exec(html)
  if (current) return current[1].toUpperCase()
  const asin = /"asin"\s*:\s*"([A-Z0-9]{10})"/i.exec(html)
  if (asin) return asin[1].toUpperCase()
  return null
}

function extractTitle($: ReturnType<typeof cheerio.load>): string | null {
  const title = $('#productTitle').first().text()
  const normalized = normalizeText(title)
  return normalized || null
}

export interface AParseResult {
  inStock: boolean
  message: string
  pageAsin: string | null
}

export function parseASearchPage(
  html: string,
  expectedAsin: string
): AParseResult {
  const $ = cheerio.load(html)
  if (isAPageBlocked(html, $)) {
    throw new Error(
      '亚马逊返回了验证页面，暂时无法获取商品信息，请稍后重试或配置代理。'
    )
  }

  const expected = expectedAsin.toUpperCase()
  const pageAsin = extractPageAsin($, html)
  const title = extractTitle($)
  const asinMismatch = Boolean(pageAsin && pageAsin !== expected)

  if (asinMismatch) {
    return {
      inStock: false,
      message: `A搜索未找到指定商品（页面商品为 ${pageAsin}，目标为 ${expected}）`,
      pageAsin
    }
  }
  if (title || pageAsin === expected) {
    return {
      inStock: true,
      message: 'A搜索找到指定商品',
      pageAsin
    }
  }
  return {
    inStock: false,
    message: 'A搜索未找到指定商品',
    pageAsin
  }
}

function parseSearchMetadata(html: string): {
  totalResultCount: number
  asinOnPageCount: number
} | null {
  const match = /P\.declare\('s\\-metadata',\s*(\{.*?\})\);/.exec(html)
  if (!match) return null
  try {
    const data = JSON.parse(match[1]) as {
      totalResultCount?: number
      asinOnPageCount?: number
    }
    return {
      totalResultCount: Number(data.totalResultCount || 0),
      asinOnPageCount: Number(data.asinOnPageCount || 0)
    }
  } catch {
    return null
  }
}

function extractSearchResultAsins(
  $: ReturnType<typeof cheerio.load>
): Set<string> {
  const asins = new Set<string>()
  $('[data-asin]').each((_, el) => {
    const asin = ($(el).attr('data-asin') || '').trim().toUpperCase()
    if (/^[A-Z0-9]{10}$/.test(asin)) {
      asins.add(asin)
    }
  })
  return asins
}

export interface BParseResult {
  inStock: boolean
  message: string
}

export function parseBSearchPage(html: string, asin: string): BParseResult {
  if (isSoftBlockedHtml(html) && html.toLowerCase().includes('bm-verify')) {
    throw new Error(
      '亚马逊搜索返回了验证页面，暂时无法完成 B 搜索，请稍后重试或配置代理。'
    )
  }

  const $ = cheerio.load(html)
  const normalizedAsin = asin.toUpperCase()
  const metadata = parseSearchMetadata(html)
  const resultAsins = extractSearchResultAsins($)

  let noResults = false
  let message = 'B搜索找到指定商品'

  if (metadata) {
    if (
      metadata.totalResultCount === 0 ||
      metadata.asinOnPageCount === 0 ||
      !resultAsins.has(normalizedAsin)
    ) {
      noResults = true
      message = 'B搜索未找到指定商品'
    }
  } else {
    const noResultEl = $(
      "[cel_widget_id*='no-results'], [widgetid*='no-results'], .s-no-results"
    )
    const hasKeyword = B_SEARCH_NO_RESULT_KEYWORDS.some((k) =>
      html.toLowerCase().includes(k.toLowerCase())
    )
    if (
      noResultEl.length > 0 ||
      hasKeyword ||
      !resultAsins.has(normalizedAsin)
    ) {
      noResults = true
      message = 'B搜索未找到指定商品'
    }
  }

  return { inStock: !noResults, message }
}
