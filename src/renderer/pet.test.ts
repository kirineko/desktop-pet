// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('./assets/pets/feibi-pixel.png', () => ({ default: 'feibi.png' }))
vi.mock('./assets/pets/guga-pixel.png', () => ({ default: 'guga.png' }))
vi.mock('./assets/pets/doro-pixel.png', () => ({ default: 'doro.png' }))
vi.mock('./assets/pets/nuonuo-pixel.png', () => ({ default: 'nuonuo.png' }))

import { Bubble } from './bubble'
import { PetController } from './pet'

describe('PetController interactions', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  function setup() {
    const openPanel = vi.fn()
    const openChat = vi.fn()
    const moveWindow = vi.fn()
    const savePosition = vi.fn()
    const showContextMenu = vi.fn()

    window.desktopPet = {
      openPanel,
      openChat,
      moveWindow,
      savePosition,
      showContextMenu
    } as unknown as Window['desktopPet']

    const bubbleEl = document.createElement('div')
    bubbleEl.className = 'bubble hidden'
    const stage = document.createElement('div')
    const image = document.createElement('img')
    stage.appendChild(image)
    document.body.append(bubbleEl, stage)

    const bubble = new Bubble(bubbleEl)
    const pet = new PetController(image, stage, bubble, 'doro')
    return { bubbleEl, stage, bubble, pet, openPanel, openChat }
  }

  it('opens action menu on click instead of opening inventory on dblclick', () => {
    const { stage, bubbleEl, openPanel, openChat } = setup()

    stage.dispatchEvent(
      new MouseEvent('mousedown', { button: 0, screenX: 10, screenY: 10 })
    )
    window.dispatchEvent(new MouseEvent('mouseup'))

    expect(bubbleEl.classList.contains('menu')).toBe(true)
    expect(bubbleEl.textContent).toContain('和我聊天')
    expect(bubbleEl.textContent).toContain('库存管理')

    stage.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    expect(openPanel).not.toHaveBeenCalled()

    const chatBtn = bubbleEl.querySelector(
      '[data-action-id="chat"]'
    ) as HTMLButtonElement
    chatBtn.click()
    expect(openChat).toHaveBeenCalledWith({ petId: 'doro', view: 'chat' })
  })

  it('treats drag as move and does not open menu', () => {
    const { stage, bubbleEl } = setup()
    stage.dispatchEvent(
      new MouseEvent('mousedown', { button: 0, screenX: 10, screenY: 10 })
    )
    window.dispatchEvent(
      new MouseEvent('mousemove', { screenX: 40, screenY: 10 })
    )
    window.dispatchEvent(new MouseEvent('mouseup'))
    expect(bubbleEl.classList.contains('menu')).toBe(false)
  })

  it('does not replace an open action menu with idle chatter', () => {
    const { stage, bubbleEl, pet } = setup()
    stage.dispatchEvent(
      new MouseEvent('mousedown', { button: 0, screenX: 10, screenY: 10 })
    )
    window.dispatchEvent(new MouseEvent('mouseup'))
    const menuText = bubbleEl.textContent

    expect(pet.showRandomIdleLine()).toBe(false)
    expect(bubbleEl.textContent).toBe(menuText)
  })

  it('closes the action menu when the pet is clicked again', () => {
    const { stage, bubbleEl } = setup()
    const clickPet = (): void => {
      stage.dispatchEvent(
        new MouseEvent('mousedown', { button: 0, screenX: 10, screenY: 10 })
      )
      window.dispatchEvent(new MouseEvent('mouseup'))
    }

    clickPet()
    expect(bubbleEl.classList.contains('menu')).toBe(true)
    clickPet()
    expect(bubbleEl.classList.contains('hidden')).toBe(true)
    expect(bubbleEl.textContent).toBe('')
  })
})
