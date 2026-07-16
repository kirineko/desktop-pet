import './style.css'
import { Bubble } from './bubble'
import { PetController } from './pet'
import type { PetConfig, PetId } from '../shared/types'

async function bootstrap(): Promise<void> {
  const image = document.getElementById('pet-image') as HTMLImageElement
  const stage = document.getElementById('pet-stage') as HTMLElement
  const bubbleEl = document.getElementById('bubble') as HTMLElement

  const bubble = new Bubble(bubbleEl)
  const config = await window.desktopPet.getConfig()
  const pet = new PetController(image, stage, bubble, config.petId)

  window.desktopPet.onConfigChanged((next: PetConfig) => {
    pet.setPet(next.petId)
  })

  window.desktopPet.onBusinessEvent((event) => {
    if (event.type === 'status') {
      if (event.status.hasJob) {
        // paused 用轻量 busy，仍显示进度
        pet.setBusinessState('busy')
        const label =
          event.status.statusLabel === '已暂停'
            ? `暂停 ${event.status.percent}%`
            : `${event.status.percent}% · 无货 ${event.status.outOfStockCount}`
        bubble.show(label, 'busy', {
          persistent: true,
          dismissible: false
        })
      } else {
        pet.setBusinessState(null)
      }
      return
    }
    if (event.type === 'alert') {
      pet.setBusinessState('alert')
      bubble.show(event.message, 'alert', {
        persistent: true,
        dismissible: false
      })
      return
    }
    if (event.type === 'message') {
      pet.setBusinessState(null)
      bubble.show(event.message, 'normal', {
        persistent: Boolean(event.persistent),
        dismissible: Boolean(event.persistent)
      })
    }
  })

  const initialStatus = await window.desktopPet.getJobStatus()
  if (initialStatus.hasJob) {
    pet.setBusinessState('busy')
    bubble.show(
      initialStatus.statusLabel === '已暂停'
        ? `暂停 ${initialStatus.percent}%`
        : `${initialStatus.percent}% · 无货 ${initialStatus.outOfStockCount}`,
      'busy',
      { persistent: true, dismissible: false }
    )
  }

  // 启动欢迎语
  const labels: Record<PetId, string> = {
    feibi: '菲比来啦～',
    guga: '咕嘎！',
    doro: 'Doro 报到！',
    nuonuo: '糯糯来了～'
  }
  if (!initialStatus.hasJob) {
    pet.say(labels[config.petId])
  }
}

void bootstrap()
