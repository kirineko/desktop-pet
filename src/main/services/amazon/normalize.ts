import type { SearchMode, TransformCodesResponse } from '../../../shared/types'

export class NormalizeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NormalizeError'
  }
}

const ASIN_PATTERN =
  /(?:\/dp\/|\/gp\/product\/|\/gp\/aw\/d\/|\/ASIN\/)([A-Z0-9]{10})/i
const ASIN_ONLY = /^[A-Z0-9]{10}$/i
const RAW_CODE_PREFIX = /^[a-z]{1,10}-/i
export const DEFAULT_AMAZON_HOST = 'www.amazon.co.jp'
export const MAX_JOB_ITEMS = 20000

export interface NormalizedInput {
  rawInput: string
  asin: string
  productUrl: string
  inputType: 'url' | 'code'
}

export function isAmazonProductUrl(text: string): boolean {
  const lowered = text.toLowerCase()
  return (
    lowered.includes('amazon.') &&
    (lowered.includes('/dp/') ||
      lowered.includes('/gp/product/') ||
      lowered.includes('/gp/aw/d/') ||
      lowered.includes('/asin/'))
  )
}

export function extractAsinFromUrl(url: string): string {
  const match = ASIN_PATTERN.exec(url)
  if (!match) {
    throw new NormalizeError('无法从链接中识别商品 ASIN，请检查链接是否正确。')
  }
  return match[1].toUpperCase()
}

export function buildProductUrl(url: string, asin: string): string {
  try {
    const parsed = new URL(url)
    if (parsed.hostname.toLowerCase().includes('amazon.')) {
      return `https://${parsed.hostname.toLowerCase()}/dp/${asin}`
    }
  } catch {
    // ignore
  }
  return `https://${DEFAULT_AMAZON_HOST}/dp/${asin}`
}

export function getAmazonHost(url: string): string {
  try {
    const parsed = new URL(url)
    if (parsed.hostname.toLowerCase().includes('amazon.')) {
      return parsed.hostname.toLowerCase()
    }
  } catch {
    // ignore
  }
  return DEFAULT_AMAZON_HOST
}

function stripObfuscationSuffix(code: string): string {
  if (code.length >= 13 && /\d{3}$/.test(code)) {
    return code.slice(0, -3)
  }
  return code
}

function stripRawCodePrefix(code: string): string {
  return code.replace(RAW_CODE_PREFIX, '')
}

export function extractAsinFromCode(code: string): string {
  const cleaned = stripRawCodePrefix(stripObfuscationSuffix(code.trim()))
  if (ASIN_ONLY.test(cleaned)) {
    return cleaned.toUpperCase()
  }
  const match = /[A-Z0-9]{10}/i.exec(cleaned)
  if (match) {
    return match[0].toUpperCase()
  }
  throw new NormalizeError(
    `无法从商品码「${code}」识别 ASIN，请检查格式是否正确。`
  )
}

/** 后台原商品码 → 标准 10 位 ASIN */
export function transformBackendProductCode(rawInput: string): string {
  const text = (rawInput || '').trim().toLowerCase()
  if (!text) {
    throw new NormalizeError('商品码不能为空。')
  }

  let core = text.includes('-') ? text.split('-').pop()! : text
  if (core.length >= 3 && /\d{3}$/.test(core)) {
    core = core.slice(0, -3)
  }

  if (core.length === 10 && ASIN_ONLY.test(core)) {
    return core.toUpperCase()
  }
  if (core.length === 9 && /^[a-z0-9]{9}$/.test(core)) {
    return `B${core}`.toUpperCase()
  }

  throw new NormalizeError(
    `无法转换「${rawInput}」，处理后为「${core}」（长度 ${core.length}）。`
  )
}

export function normalizeASearchInput(rawInput: string): NormalizedInput {
  const text = (rawInput || '').trim()
  if (!text) throw new NormalizeError('链接不能为空。')
  if (!isAmazonProductUrl(text)) {
    throw new NormalizeError(
      `「${text}」不是有效的亚马逊商品链接。A 模式请使用完整链接，如 https://www.amazon.co.jp/dp/B0CW8H34Z8`
    )
  }
  const asin = extractAsinFromUrl(text)
  return {
    rawInput: text,
    asin,
    productUrl: buildProductUrl(text, asin),
    inputType: 'url'
  }
}

export function normalizeBSearchInput(rawInput: string): NormalizedInput {
  const text = (rawInput || '').trim()
  if (!text) throw new NormalizeError('商品码不能为空。')
  if (isAmazonProductUrl(text)) {
    throw new NormalizeError('B 模式请只输入商品码。链接请使用「链接查询(A)」。')
  }
  const asin = extractAsinFromCode(text)
  return {
    rawInput: text,
    asin,
    productUrl: `https://${DEFAULT_AMAZON_HOST}/dp/${asin}`,
    inputType: 'code'
  }
}

export function normalizeAbSearchInput(rawInput: string): NormalizedInput {
  const text = (rawInput || '').trim()
  if (!text) throw new NormalizeError('商品码或链接不能为空。')
  if (isAmazonProductUrl(text)) {
    const asin = extractAsinFromUrl(text)
    return {
      rawInput: text,
      asin,
      productUrl: buildProductUrl(text, asin),
      inputType: 'url'
    }
  }
  const asin = extractAsinFromCode(text)
  return {
    rawInput: text,
    asin,
    productUrl: `https://${DEFAULT_AMAZON_HOST}/dp/${asin}`,
    inputType: 'code'
  }
}

export function normalizeForMode(
  rawInput: string,
  mode: SearchMode
): NormalizedInput {
  if (mode === 'a') return normalizeASearchInput(rawInput)
  if (mode === 'b') return normalizeBSearchInput(rawInput)
  return normalizeAbSearchInput(rawInput)
}

export function parseInputLines(
  text: string,
  maxCount: number | null = MAX_JOB_ITEMS
): string[] {
  const inputs: string[] = []
  const seen = new Set<string>()
  for (const line of text.split(/[\r\n,]+/)) {
    const value = line.trim()
    if (!value || seen.has(value)) continue
    seen.add(value)
    inputs.push(value)
    if (maxCount !== null && inputs.length >= maxCount) break
  }
  return inputs
}

export function parseAndValidateInputs(
  text: string,
  mode: SearchMode
): { inputs: string[]; error?: string } {
  const inputs = parseInputLines(text)
  if (inputs.length === 0) {
    return { inputs: [], error: '请输入至少一条链接或商品码。' }
  }
  try {
    for (const value of inputs) {
      normalizeForMode(value, mode)
    }
  } catch (err) {
    return {
      inputs: [],
      error: err instanceof Error ? err.message : String(err)
    }
  }
  return { inputs }
}

export function transformBackendProductCodes(text: string): TransformCodesResponse {
  const results: TransformCodesResponse['results'] = []
  const outputs: string[] = []
  for (const line of parseInputLines(text, null)) {
    try {
      const output = transformBackendProductCode(line)
      results.push({ input: line, output, success: true })
      outputs.push(output)
    } catch (err) {
      results.push({
        input: line,
        error: err instanceof Error ? err.message : String(err),
        success: false
      })
    }
  }
  return {
    results,
    outputText: outputs.join('\n'),
    successCount: outputs.length,
    errorCount: results.length - outputs.length
  }
}

export function stockStatusLabel(
  aInStock: boolean | null | undefined,
  bInStock: boolean | null | undefined,
  mode: SearchMode
): string {
  if (mode === 'a') return aInStock ? 'A搜索有货' : 'A搜索无货'
  if (mode === 'b') return bInStock ? 'B搜索有货' : 'B搜索无货'
  const aOk = Boolean(aInStock)
  const bOk = Boolean(bInStock)
  if (aOk && bOk) return '有货'
  if (!aOk && !bOk) return 'AB搜索均无货'
  if (!aOk) return 'A搜索无货'
  return 'B搜索无货'
}
