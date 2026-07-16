import { describe, expect, it } from 'vitest'
import { parseASearchPage, parseBSearchPage } from './parse'

describe('parseASearchPage', () => {
  it('extracts title, price and stock detail from in-stock product page', () => {
    const html = `
      <html><body>
        <div id="dp" data-asin="B0D9PXQLKY"></div>
        <input name="ASIN" value="B0D9PXQLKY" />
        <span id="productTitle">MAMBASNAKE K85 Keyboard</span>
        <div id="corePrice_feature_div"><span class="a-offscreen">¥13,599</span></div>
        <div id="buybox">
          <div id="availability">Only 15 left in stock - order soon.</div>
          <input id="add-to-cart-button" type="submit" value="Add to Cart" />
          <div id="mir-layout-DELIVERY_BLOCK"><span class="a-text-bold">¥3,068 delivery</span></div>
        </div>
      </body></html>
    `
    const parsed = parseASearchPage(html, 'B0D9PXQLKY')
    expect(parsed.inStock).toBe(true)
    expect(parsed.title).toContain('MAMBASNAKE')
    expect(parsed.price).toBe('¥13,599')
    expect(parsed.stockDetail).toContain('Only 15 left')
    expect(parsed.deliveryInfo).toContain('delivery')
  })

  it('falls back to a-price-whole parts when offscreen is empty', () => {
    const html = `
      <html><body>
        <input name="ASIN" value="B0CW8H34Z8" />
        <span id="productTitle">Blue Keyboard</span>
        <div id="corePrice_feature_div">
          <span class="a-price">
            <span class="a-offscreen"> </span>
            <span class="a-price-symbol">¥</span>
            <span class="a-price-whole">12,799</span>
          </span>
        </div>
        <div id="buybox">
          <div id="availability">在庫あり。</div>
          <input id="add-to-cart-button" type="submit" />
        </div>
      </body></html>
    `
    const parsed = parseASearchPage(html, 'B0CW8H34Z8')
    expect(parsed.inStock).toBe(true)
    expect(parsed.price).toBe('¥12,799')
  })

  it('marks Japanese out-of-stock buybox as unavailable', () => {
    const html = `
      <html><body>
        <input name="ASIN" value="B0D66K2TFP" />
        <span id="productTitle">AFAM Rear Steel Sprocket 525-41</span>
        <div id="buybox">
          <div id="availability">現在在庫切れです。この商品の再入荷予定は立っておりません。</div>
          <a href="#">リストに追加</a>
        </div>
        <!-- 推荐商品价格，不应被当成主商品有货价 -->
        <div class="s-result-item">
          <span class="a-price"><span class="a-offscreen">¥2,867</span></span>
        </div>
      </body></html>
    `
    const parsed = parseASearchPage(html, 'B0D66K2TFP')
    expect(parsed.inStock).toBe(false)
    expect(parsed.price).toBeNull()
    expect(parsed.stockDetail).toContain('在庫切れ')
    expect(parsed.message).toContain('在庫切れ')
  })

  it('marks English currently unavailable page as out of stock', () => {
    const html = `
      <html><body>
        <input name="ASIN" value="B0D66K2TFP" />
        <span id="productTitle">AFAM Sprocket</span>
        <div id="outOfStock">
          <span>Currently unavailable.</span>
          <span>We don't know when or if this item will be back in stock.</span>
        </div>
        <div id="buybox">Currently unavailable. Add to List</div>
      </body></html>
    `
    const parsed = parseASearchPage(html, 'B0D66K2TFP')
    expect(parsed.inStock).toBe(false)
    expect(parsed.price).toBeNull()
  })

  it('ignores script fragments in delivery/detail extraction', () => {
    const html = `
      <html><body>
        <input name="ASIN" value="B0D66K2TFP" />
        <span id="productTitle">AFAM Sprocket</span>
        <div id="buybox">
          <div id="availability">Currently unavailable.</div>
          <div id="mir-layout-DELIVERY_BLOCK">
            P.when("A", "load").execute("aod-assets-loaded", function(A){ return 1; })
          </div>
        </div>
      </body></html>
    `
    const parsed = parseASearchPage(html, 'B0D66K2TFP')
    expect(parsed.deliveryInfo).toBeNull()
    expect(parsed.inStock).toBe(false)
  })
})

describe('parseBSearchPage', () => {
  it('extracts title and price from matching search card', () => {
    const html = `
      <html><body>
        <div class="s-main-slot">
          <div data-asin="B0D9PXQLKY" data-component-type="s-search-result">
            <h2><a><span>MAMBASNAKE×ATTACK SHARK K85</span></a></h2>
            <span class="a-price"><span class="a-offscreen">¥13,599</span></span>
          </div>
        </div>
      </body></html>
    `
    const parsed = parseBSearchPage(html, 'B0D9PXQLKY')
    expect(parsed.inStock).toBe(true)
    expect(parsed.title).toContain('MAMBASNAKE')
    expect(parsed.price).toBe('¥13,599')
  })

  it('marks missing ASIN as out of stock', () => {
    const html = `
      <html><body>
        <div class="s-main-slot">
          <div data-asin="B000000000" data-component-type="s-search-result">
            <h2><a><span>Other item</span></a></h2>
          </div>
        </div>
      </body></html>
    `
    const parsed = parseBSearchPage(html, 'B0D9PXQLKY')
    expect(parsed.inStock).toBe(false)
    expect(parsed.price).toBeNull()
  })
})
