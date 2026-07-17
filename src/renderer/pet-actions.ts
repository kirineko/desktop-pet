import type { PetId } from '../shared/types'
import type { BubbleAction } from './bubble'

export type PetActionId = 'chat' | 'inventory' | 'persona'

export interface PetActionDefinition extends BubbleAction {
  id: PetActionId
}

/** 可扩展的桌宠动作注册表；后续新功能在此追加即可。 */
export const PET_ACTIONS: PetActionDefinition[] = [
  { id: 'chat', label: '和我聊天' },
  { id: 'inventory', label: '库存管理' },
  { id: 'persona', label: '角色设定' }
]

export async function runPetAction(
  actionId: string,
  petId: PetId
): Promise<void> {
  switch (actionId) {
    case 'chat':
      await window.desktopPet.openChat({ petId, view: 'chat' })
      return
    case 'inventory':
      await window.desktopPet.openPanel()
      return
    case 'persona':
      await window.desktopPet.openChat({ petId, view: 'persona' })
      return
    default:
      return
  }
}
