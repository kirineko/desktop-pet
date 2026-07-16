import * as cheerio from 'cheerio'

const B_SEARCH_NO_RESULT_KEYWORDS = [
  '您的搜索查询无结果',
  '搜索查询无结果',
  '検索クエリに一致する結果はありません',
  '検索に一致する商品はありません',
  'did not match any products',
  'no results for'
]

const IN_STOCK_KEYWORDS = [
  '现在有货',
  '目前有货',
  '现货',
  '在庫あり',
  '在庫あります',
  'in stock',
  'left in stock',
  '仅剩',
  '残り',
  'ご注文はお早めに'
]

const OUT_OF_STOCK_KEYWORDS = [
  '目前无货',
  '现在无货',
  '暂时无货',
  '当前无货',
  '現在无货',
  '現在在庫切れ',
  '在庫切れです',
  'currently unavailable',
  'temporarily out of stock',
  'no featured offers available',
  'この商品の再入荷予定は立っておりません',
  "we don't know when or if this item will be back in stock"
]

const PURCHASE_BUTTON_SELECTORS = [
  '#add-to-cart-button',
  '#buy-now-button',
  "input[name='submit.add-to-cart']",
  "input[name='submit.buy-now']"
]

/** 仅限主商品价格区，避免误取「Customers also viewed」等推荐价 */
const PRICE_SELECTORS = [
  '#corePrice_feature_div .a-offscreen',
  '#corePriceDisplay_desktop_feature_div .a-offscreen',
  '#apex_desktop .apexPriceToPay .a-offscreen',
  '#buybox .a-price .a-offscreen',
  '#desktop_buybox .a-price .a-offscreen',
  '#priceblock_ourprice',
  '#priceblock_dealprice',
  '#tp_price_block_total_price_ww .a-offscreen',
  '#buybox span.priceToPay .a-offscreen',
  "#buybox span.a-price[data-a-color='base'] .a-offscreen"
]

const BUYBOX_ROOT_SELECTORS = [
  '#buybox',
  '#desktop_buybox',
  '#qualifiedBuybox',
  '#apex_desktop'
]

const DELIVERY_SELECTORS = [
  '#mir-layout-DELIVERY_BLOCK .a-text-bold',
  '#deliveryBlock_feature_div .a-text-bold',
  '#deliveryBlockMessage',
  '#ddmDeliveryMessage',
  '#mir-layout-DELIVERY_BLOCK',
  '#deliveryBlock_feature_div',
  '#amazonGlobal_feature_div'
]

const PRICE_PATTERN =
  /(?:HKD|USD|JPY|CNY|EUR|GBP|￥|¥|\$|€|£)\s*[\d,]+(?:\.\d+)?|[\d,]+(?:\.\d+)?\s*(?:HKD|USD|JPY|CNY)/i

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
  for (const selector of [
    '#productTitle',
    '#title',
    '#titleSection #productTitle',
    '#title_feature_div #productTitle',
    'h1#title span',
    'h1.a-size-large'
  ]) {
    const normalized = normalizeText($(selector).first().text())
    if (normalized) return normalized
  }
  return null
}

function looksLikePrice(text: string): boolean {
  return PRICE_PATTERN.test(normalizeText(text))
}

function getBuyboxRoot($: ReturnType<typeof cheerio.load>) {
  for (const selector of BUYBOX_ROOT_SELECTORS) {
    const el = $(selector).first()
    if (el.length) return el
  }
  return $.root()
}

function extractPriceFromParts(
  $: ReturnType<typeof cheerio.load>
): string | null {
  const roots = [
    $('#corePrice_feature_div').first(),
    $('#corePriceDisplay_desktop_feature_div').first(),
    $('#buybox').first(),
    $('#desktop_buybox').first()
  ]
  for (const root of roots) {
    if (!root.length) continue
    const symbol = normalizeText(
      root.find('.a-price-symbol').first().text() || '¥'
    )
    const whole = normalizeText(root.find('.a-price-whole').first().text())
    if (!whole || !/[\d,]/.test(whole)) continue
    const fraction = normalizeText(root.find('.a-price-fraction').first().text())
    const price = fraction ? `${symbol}${whole}${fraction}` : `${symbol}${whole}`
    if (looksLikePrice(price) || /[\d,]{2,}/.test(whole)) {
      return price.replace(/\s+/g, '')
    }
  }
  return null
}

function extractPrice($: ReturnType<typeof cheerio.load>): string | null {
  for (const selector of [
    ...PRICE_SELECTORS,
    '#buybox .aok-offscreen',
    '#apex-pricetopay-accessibility-label'
  ]) {
    const el = $(selector).first()
    if (!el.length) continue
    const price = normalizeText(el.text())
    if (looksLikePrice(price)) return price
  }
  return extractPriceFromParts($)
}

function extractPriceWithTax($: ReturnType<typeof cheerio.load>): string | null {
  const price = extractPrice($)
  if (!price) return null
  const rootText = getBuyboxRoot($).text()
  if (rootText.includes('税込') && !price.includes('税込')) {
    return `${price} 税込`
  }
  return price
}

function cleanReadableText(text: string): string | null {
  let cleaned = normalizeText(text)
  if (!cleaned) return null
  // 过滤脚本/占位碎片，避免详情列出现 P.when(...) 之类内容
  if (
    /P\.when\s*\(|function\s*\(|\.execute\s*\(|A\.load|aod-assets/i.test(
      cleaned
    )
  ) {
    return null
  }
  cleaned = cleaned.replace(/\s*在庫状況について\s*/gu, ' ')
  cleaned = cleaned.replace(/\s*Click here for details of availability\.?\s*/gi, ' ')
  cleaned = cleaned.replace(/\s*詳細を見る\s*$/u, '')
  cleaned = cleaned.replace(/\{[^}]*"merchantID"[^}]*\}/gi, '')
  cleaned = cleaned.replace(/\{[^}]*"asin"[^}]*\}/gi, '')
  cleaned = normalizeText(cleaned)
  if (cleaned.length < 4 || cleaned.length > 180) return null
  return cleaned
}

function extractStockDetail($: ReturnType<typeof cheerio.load>): string | null {
  for (const selector of ['#availability', '#outOfStock', '#availability_feature_div']) {
    const el = $(selector).first()
    if (!el.length) continue
    const text = cleanReadableText(el.text())
    if (text) return text
  }
  return null
}

function extractDeliveryInfo($: ReturnType<typeof cheerio.load>): string | null {
  const root = getBuyboxRoot($)
  for (const selector of DELIVERY_SELECTORS) {
    const el = root.find(selector).first()
    if (!el.length) continue
    const text = cleanReadableText(el.text())
    if (text) return text
  }
  return null
}

function containsKeyword(text: string, keywords: string[]): boolean {
  const lowered = text.toLowerCase()
  return keywords.some((k) => lowered.includes(k.toLowerCase()))
}

function hasPurchaseButton($: ReturnType<typeof cheerio.load>): boolean {
  for (const selector of PURCHASE_BUTTON_SELECTORS) {
    if ($(selector).length > 0) return true
  }
  return false
}

/** 基于 buybox / availability 文案判断真实库存，而不是「页面是否存在」 */
function determineAStockStatus(
  $: ReturnType<typeof cheerio.load>,
  stockDetail: string | null,
  price: string | null
): boolean {
  const availabilityText = [
    stockDetail,
    normalizeText($('#availability').text()),
    normalizeText($('#outOfStock').text()),
    normalizeText(getBuyboxRoot($).text())
  ]
    .filter(Boolean)
    .join(' ')

  if (containsKeyword(availabilityText, OUT_OF_STOCK_KEYWORDS)) {
    return false
  }
  if (containsKeyword(availabilityText, IN_STOCK_KEYWORDS)) {
    return true
  }
  if (hasPurchaseButton($)) {
    return true
  }
  // 主商品区有报价且无 #outOfStock 节点时，视为有货
  if (price && $('#outOfStock').length === 0) {
    return true
  }
  return false
}

export interface AParseResult {
  inStock: boolean
  message: string
  pageAsin: string | null
  title: string | null
  price: string | null
  stockDetail: string | null
  deliveryInfo: string | null
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
  const price = extractPriceWithTax($)
  const stockDetail = extractStockDetail($)
  const deliveryInfo = extractDeliveryInfo($)

  if (asinMismatch) {
    return {
      inStock: false,
      message: `A搜索未找到指定商品（页面商品为 ${pageAsin}，目标为 ${expected}）`,
      pageAsin,
      title: null,
      price: null,
      stockDetail: null,
      deliveryInfo: null
    }
  }

  const pageFound = Boolean(title || pageAsin === expected)
  if (!pageFound) {
    return {
      inStock: false,
      message: 'A搜索未找到指定商品',
      pageAsin,
      title: null,
      price: null,
      stockDetail: null,
      deliveryInfo: null
    }
  }

  const inStock = determineAStockStatus($, stockDetail, price)
  return {
    inStock,
    message: stockDetail || (inStock ? 'A搜索有货' : 'A搜索无货'),
    pageAsin,
    title,
    // 无货时主商品通常无报价；避免把推荐商品价格写进去
    price: inStock ? price : null,
    stockDetail,
    deliveryInfo: inStock ? deliveryInfo : null
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

function extractSearchCardDetails(
  $: ReturnType<typeof cheerio.load>,
  asin: string
): { title: string | null; price: string | null } {
  const card = $(`[data-asin="${asin}"]`).first()
  if (!card.length) return { title: null, price: null }

  const title =
    normalizeText(
      card.find('h2 a span').first().text() ||
        card.find('h2 span').first().text() ||
        card.find('.a-text-normal').first().text()
    ) || null

  let price: string | null = null
  card.find('.a-price .a-offscreen, .a-color-price').each((_, el) => {
    if (price) return
    const text = normalizeText($(el).text())
    if (looksLikePrice(text)) price = text
  })

  return { title, price }
}

export interface BParseResult {
  inStock: boolean
  message: string
  title: string | null
  price: string | null
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
  const card = extractSearchCardDetails($, normalizedAsin)

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

  return {
    inStock: !noResults,
    message,
    title: noResults ? null : card.title,
    price: noResults ? null : card.price
  }
}
