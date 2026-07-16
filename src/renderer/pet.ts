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
    '咕…唔，是菲比！',
    '帽子歪了吗？',
    '菲比会认真核对的！',
    '有货无货，交给我～',
    '再点一下也没关系哦',
    '工作间隙也要喝水呀',
    '双击可以打开面板哦',
    '菲比站岗中…',
    '别担心，我陪着你',
    '这条链接看起来可疑吗？',
    '查完记得歇一会儿～',
    '嗯嗯，收到！',
    '菲比心跳加速了…一点点',
    '要开始新任务了吗？'
  ],
  guga: [
    '咕嘎！',
    '咕嘎咕嘎～',
    '别戳啦！',
    '有任务吗？',
    '咕嘎准备好了',
    '咕！嘎！！',
    '咕嘎出击！',
    '再戳就咕嘎叫！',
    '库存？咕嘎懂！',
    '咕嘎饿了…咕',
    '翅膀痒痒的',
    '咕嘎守护中',
    '发现缺货就咕嘎！',
    '咕嘎比你先醒',
    '双击面板，咕嘎带路',
    '咕嘎咕～别走神',
    '今天也要咕嘎一整天',
    '咕嘎！任务来了吗！'
  ],
  doro: [
    'Doro～',
    '戳到我了！',
    '嘿嘿嘿',
    '要出发了吗？',
    'Doro 在待命',
    '嘿嘿，被抓到了',
    'Doro 超闲的…才怪',
    '再点一下试试？',
    '库存侦探 Doro 上线',
    '芜湖～起飞！',
    '别摸头，会变强…吗？',
    'Doro 什么都看得见',
    '缺货警报？交给我',
    '摸鱼？不存在的',
    '双击我，面板开门！',
    '嘿嘿嘿，又被戳',
    'Doro 今日份元气满满',
    '查库存也要开心点嘛'
  ],
  nuonuo: [
    '糯糯软软的…',
    '轻轻戳就好啦',
    '糯糯想睡觉',
    '有好吃的吗？',
    '糯糯陪着你',
    '嗯…揉揉就好',
    '糯糯有点困困',
    '再软一点点…',
    '库存…好复杂哦',
    '糯糯慢慢查也行',
    '摸头杀…可以的',
    '饿了要吃软软的',
    '糯糯不会跑掉的',
    '双击打开面板呀',
    '今天也要软绵绵',
    '呼…打个小哈欠',
    '有货了会开心告诉你',
    '糯糯贴贴～'
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
