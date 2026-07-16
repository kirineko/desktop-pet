import './style.css'
import { Bubble } from './bubble'
import { PetController } from './pet'
import { SessionHud } from './session-hud'
import type { PetConfig, PetId, SessionSummary } from '../shared/types'

function isSessionBusy(summary: SessionSummary): boolean {
  return (
    summary.hasJob &&
    (summary.status === 'running' ||
      summary.status === 'paused' ||
      summary.status === 'pending')
  )
}

async function bootstrap(): Promise<void> {
  const image = document.getElementById('pet-image') as HTMLImageElement
  const stage = document.getElementById('pet-stage') as HTMLElement
  const bubbleEl = document.getElementById('bubble') as HTMLElement

  const bubble = new Bubble(bubbleEl)
  const sessionHud = new SessionHud()
  const config = await window.desktopPet.getConfig()
  const pet = new PetController(image, stage, bubble, config.petId)
  let alertLatched = false

  const syncBusyFromSession = (): void => {
    if (alertLatched) return
    pet.setBusinessState(
      isSessionBusy(sessionHud.getSummary()) ? 'busy' : null
    )
  }

  window.desktopPet.onConfigChanged((next: PetConfig) => {
    pet.setPet(next.petId)
  })

  window.desktopPet.onBusinessEvent((event) => {
    if (event.type === 'session') {
      sessionHud.update(event.summary)
      syncBusyFromSession()
      return
    }
    if (event.type === 'status') {
      // 进度改由 session chip 展示，避免与气泡抢位
      return
    }
    if (event.type === 'alert') {
      alertLatched = true
      pet.setBusinessState('alert')
      bubble.show(event.message, 'alert', {
        persistent: true,
        dismissible: false
      })
      return
    }
    if (event.type === 'message') {
      alertLatched = false
      syncBusyFromSession()
      bubble.show(event.message, 'normal', {
        persistent: Boolean(event.persistent),
        dismissible: Boolean(event.persistent)
      })
    }
  })

  const [initialStatus, initialSession] = await Promise.all([
    window.desktopPet.getJobStatus(),
    window.desktopPet.getSessionSummary()
  ])
  sessionHud.update(initialSession)
  if (isSessionBusy(initialSession) || initialStatus.hasJob) {
    pet.setBusinessState('busy')
  }

  const labels: Record<PetId, string> = {
    feibi: '菲比来啦～',
    guga: '咕嘎！',
    doro: 'Doro 报到！',
    nuonuo: '糯糯来了～'
  }
  if (!isSessionBusy(initialSession) && !initialStatus.hasJob) {
    pet.say(labels[config.petId])
  }
}

void bootstrap()
