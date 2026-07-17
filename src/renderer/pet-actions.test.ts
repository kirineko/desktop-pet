// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { PET_ACTIONS, runPetAction } from './pet-actions'

describe('pet-actions', () => {
  it('exposes extensible action registry', () => {
    expect(PET_ACTIONS.map((a) => a.id)).toEqual([
      'chat',
      'inventory',
      'persona'
    ])
  })

  it('routes actions to IPC helpers', async () => {
    const openChat = vi.fn()
    const openPanel = vi.fn()
    window.desktopPet = {
      openChat,
      openPanel
    } as unknown as Window['desktopPet']

    await runPetAction('chat', 'feibi')
    await runPetAction('inventory', 'feibi')
    await runPetAction('persona', 'feibi')

    expect(openChat).toHaveBeenCalledWith({ petId: 'feibi', view: 'chat' })
    expect(openPanel).toHaveBeenCalled()
    expect(openChat).toHaveBeenCalledWith({ petId: 'feibi', view: 'persona' })
  })
})
