export type BubbleTone = 'normal' | 'busy' | 'alert'

const HIDE_MS = 2800

export interface BubbleShowOptions {
  persistent?: boolean
  dismissible?: boolean
}

export class Bubble {
  private el: HTMLElement
  private hideTimer: number | null = null

  constructor(el: HTMLElement) {
    this.el = el
    this.el.addEventListener('click', () => {
      if (this.el.classList.contains('dismissible')) {
        this.hide()
      }
    })
  }

  show(
    text: string,
    tone: BubbleTone = 'normal',
    options: BubbleShowOptions = {}
  ): void {
    this.el.textContent = text
    this.el.classList.remove('hidden', 'busy', 'alert', 'dismissible')
    if (tone === 'busy') this.el.classList.add('busy')
    if (tone === 'alert') this.el.classList.add('alert')
    if (options.dismissible) this.el.classList.add('dismissible')
    if (this.el instanceof HTMLButtonElement) {
      this.el.disabled = !options.dismissible
    }

    // 强制重启动画
    this.el.style.animation = 'none'
    void this.el.offsetWidth
    this.el.style.animation = ''

    if (this.hideTimer !== null) {
      window.clearTimeout(this.hideTimer)
      this.hideTimer = null
    }
    if (!options.persistent) {
      this.hideTimer = window.setTimeout(() => this.hide(), HIDE_MS)
    }
  }

  hide(): void {
    this.el.classList.add('hidden')
    this.el.classList.remove('busy', 'alert', 'dismissible')
    if (this.el instanceof HTMLButtonElement) {
      this.el.disabled = true
    }
    if (this.hideTimer !== null) {
      window.clearTimeout(this.hideTimer)
      this.hideTimer = null
    }
  }
}
