import type { PetId, PetVisualState } from '../shared/types'
import { PET_LABELS } from '../shared/types'
import type { Bubble } from './bubble'

import feibiUrl from './assets/pets/feibi-pixel.png'
import gugaUrl from './assets/pets/guga-pixel.png'
import doroUrl from './assets/pets/doro-pixel.png'
import nuonuoUrl from './assets/pets/nuonuo-pixel.png'

const PET_IMAGES: Record<PetId, string> = {
  feibi: feibiUrl,
  guga: gugaUrl,
  doro: doroUrl,
  nuonuo: nuonuoUrl
}

const LINES: Record<PetId, string[]> = {
  feibi: [
    '菲比在听哦～',
    '今天也要加油！',
    '点我干嘛呀～',
    '一起查库存吧！',
    '咕…唔，是菲比！'
  ],
  guga: [
    '咕嘎！',
    '咕嘎咕嘎～',
    '别戳啦！',
    '有任务吗？',
    '咕嘎准备好了'
  ],
  doro: [
    'Doro～',
    '戳到我了！',
    '嘿嘿嘿',
    '要出发了吗？',
    'Doro 在待命'
  ],
  nuonuo: [
    '糯糯软软的…',
    '轻轻戳就好啦',
    '糯糯想睡觉',
    '有好吃的吗？',
    '糯糯陪着你'
  ]
}

const STATE_CLASS: Record<PetVisualState, string> = {
  idle: 'state-idle',
  drag: 'state-drag',
  click: 'state-click',
  busy: 'state-busy',
  alert: 'state-alert'
}

export class PetController {
  private image: HTMLImageElement
  private stage: HTMLElement
  private bubble: Bubble
  private petId: PetId = 'doro'
  private visualState: PetVisualState = 'idle'
  private dragging = false
  private lastMouse = { x: 0, y: 0 }
  private clickArmed = false
  private moved = false
  private businessOverride: PetVisualState | null = null

  constructor(
    image: HTMLImageElement,
    stage: HTMLElement,
    bubble: Bubble,
    initialPetId: PetId
  ) {
    this.image = image
    this.stage = stage
    this.bubble = bubble
    this.setPet(initialPetId)
    this.bindEvents()
  }

  setPet(petId: PetId): void {
    this.petId = petId
    this.image.src = PET_IMAGES[petId]
    this.image.alt = PET_LABELS[petId]
  }

  /** 业务层设置 busy/alert；null 则回到 idle */
  setBusinessState(state: 'busy' | 'alert' | null): void {
    this.businessOverride = state
    if (!this.dragging && this.visualState !== 'click') {
      this.applyState(state ?? 'idle')
    }
  }

  say(text: string, tone: 'normal' | 'busy' | 'alert' = 'normal'): void {
    this.bubble.show(text, tone)
  }

  private applyState(state: PetVisualState): void {
    this.visualState = state
    this.image.classList.remove(
      'state-idle',
      'state-drag',
      'state-click',
      'state-busy',
      'state-alert'
    )
    this.image.classList.add(STATE_CLASS[state])
  }

  private randomLine(): string {
    const lines = LINES[this.petId]
    return lines[Math.floor(Math.random() * lines.length)]
  }

  private bindEvents(): void {
    this.stage.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return
      this.dragging = true
      this.clickArmed = true
      this.moved = false
      this.lastMouse = { x: e.screenX, y: e.screenY }
      this.applyState('drag')
      e.preventDefault()
    })

    window.addEventListener('mousemove', (e) => {
      if (!this.dragging) return
      const dx = e.screenX - this.lastMouse.x
      const dy = e.screenY - this.lastMouse.y
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
        this.moved = true
      }
      this.lastMouse = { x: e.screenX, y: e.screenY }
      void window.desktopPet.moveWindow(dx, dy)
    })

    window.addEventListener('mouseup', () => {
      if (!this.dragging) return
      this.dragging = false
      void window.desktopPet.savePosition()

      if (this.clickArmed && !this.moved) {
        this.playClick()
      } else {
        this.applyState(this.businessOverride ?? 'idle')
      }
      this.clickArmed = false
    })

    this.stage.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      void window.desktopPet.showContextMenu()
    })

    this.stage.addEventListener('dblclick', (e) => {
      e.preventDefault()
      void window.desktopPet.openPanel()
    })

    this.image.addEventListener('animationend', (e) => {
      if (
        e.animationName === 'click-bounce' &&
        this.visualState === 'click'
      ) {
        this.applyState(this.businessOverride ?? 'idle')
      }
      if (
        e.animationName === 'alert-pulse' &&
        this.visualState === 'alert'
      ) {
        this.applyState(this.businessOverride === 'alert' ? 'idle' : this.businessOverride ?? 'idle')
        if (this.businessOverride === 'alert') {
          this.businessOverride = null
        }
      }
    })
  }

  private playClick(): void {
    this.applyState('click')
    this.bubble.show(this.randomLine())
  }
}
