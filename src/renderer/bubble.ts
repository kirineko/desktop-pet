export type BubbleTone = 'normal' | 'busy' | 'alert'

export interface BubbleAction {
  id: string
  label: string
}

export interface BubbleShowOptions {
  persistent?: boolean
  dismissible?: boolean
  actions?: BubbleAction[]
  onAction?: (actionId: string) => void
}

const HIDE_MS = 2800

export class Bubble {
  private el: HTMLElement
  private hideTimer: number | null = null
  private onAction: ((actionId: string) => void) | null = null
  private outsideHandler: ((event: MouseEvent) => void) | null = null
  private keyHandler: ((event: KeyboardEvent) => void) | null = null
  private menuMode = false

  constructor(el: HTMLElement) {
    this.el = el
    this.el.addEventListener('click', (event) => {
      const target = event.target as HTMLElement | null
      const closeBtn = target?.closest?.('[data-bubble-close]')
      if (closeBtn) {
        event.preventDefault()
        event.stopPropagation()
        this.hide()
        return
      }
      const actionBtn = target?.closest?.('[data-action-id]') as HTMLElement | null
      if (actionBtn?.dataset.actionId) {
        event.preventDefault()
        event.stopPropagation()
        const id = actionBtn.dataset.actionId
        const handler = this.onAction
        this.hide()
        handler?.(id)
        return
      }

      if (this.menuMode) {
        return
      }

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
    this.clearTransientListeners()
    this.onAction = options.onAction ?? null
    this.menuMode = Boolean(options.actions && options.actions.length > 0)

    this.el.classList.remove(
      'hidden',
      'busy',
      'alert',
      'dismissible',
      'menu'
    )
    if (tone === 'busy') this.el.classList.add('busy')
    if (tone === 'alert') this.el.classList.add('alert')
    if (options.dismissible || this.menuMode) {
      this.el.classList.add('dismissible')
    }
    if (this.menuMode) this.el.classList.add('menu')

    if (this.el instanceof HTMLButtonElement) {
      this.el.disabled = this.menuMode ? false : !Boolean(options.dismissible)
    }

    this.el.replaceChildren()
    if (this.menuMode && options.actions) {
      const close = document.createElement('button')
      close.type = 'button'
      close.className = 'bubble-close'
      close.dataset.bubbleClose = 'true'
      close.setAttribute('aria-label', '关闭菜单')
      close.textContent = '×'
      const title = document.createElement('div')
      title.className = 'bubble-title'
      title.textContent = text
      const list = document.createElement('div')
      list.className = 'bubble-actions'
      list.setAttribute('role', 'menu')
      for (const action of options.actions) {
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.className = 'bubble-action'
        btn.dataset.actionId = action.id
        btn.setAttribute('role', 'menuitem')
        btn.textContent = action.label
        list.appendChild(btn)
      }
      this.el.append(close, title, list)
      this.bindMenuDismiss()
    } else {
      this.el.textContent = text
    }

    // 强制重启动画
    this.el.style.animation = 'none'
    void this.el.offsetWidth
    this.el.style.animation = ''

    if (this.hideTimer !== null) {
      window.clearTimeout(this.hideTimer)
      this.hideTimer = null
    }
    if (!options.persistent && !this.menuMode) {
      this.hideTimer = window.setTimeout(() => this.hide(), HIDE_MS)
    }
  }

  hide(): void {
    this.clearTransientListeners()
    this.menuMode = false
    this.onAction = null
    this.el.classList.add('hidden')
    this.el.classList.remove('busy', 'alert', 'dismissible', 'menu')
    this.el.replaceChildren()
    if (this.el instanceof HTMLButtonElement) {
      this.el.disabled = true
    }
    if (this.hideTimer !== null) {
      window.clearTimeout(this.hideTimer)
      this.hideTimer = null
    }
  }

  isMenuOpen(): boolean {
    return this.menuMode && !this.el.classList.contains('hidden')
  }

  canShowIdleMessage(): boolean {
    return this.el.classList.contains('hidden')
  }

  private bindMenuDismiss(): void {
    this.outsideHandler = (event: MouseEvent) => {
      if (!this.el.contains(event.target as Node)) {
        this.hide()
      }
    }
    this.keyHandler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        this.hide()
        return
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        const buttons = Array.from(
          this.el.querySelectorAll<HTMLButtonElement>('.bubble-action')
        )
        if (buttons.length === 0) return
        event.preventDefault()
        const active = document.activeElement as HTMLElement | null
        const index = buttons.findIndex((b) => b === active)
        const next =
          event.key === 'ArrowDown'
            ? buttons[(index + 1 + buttons.length) % buttons.length]
            : buttons[(index - 1 + buttons.length) % buttons.length]
        next.focus()
      }
    }
    window.setTimeout(() => {
      if (this.outsideHandler) {
        window.addEventListener('mousedown', this.outsideHandler)
      }
      if (this.keyHandler) {
        window.addEventListener('keydown', this.keyHandler)
      }
      const first = this.el.querySelector<HTMLButtonElement>('.bubble-action')
      first?.focus()
    }, 0)
  }

  private clearTransientListeners(): void {
    if (this.outsideHandler) {
      window.removeEventListener('mousedown', this.outsideHandler)
      this.outsideHandler = null
    }
    if (this.keyHandler) {
      window.removeEventListener('keydown', this.keyHandler)
      this.keyHandler = null
    }
  }
}
