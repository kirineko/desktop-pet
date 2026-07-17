import './chat.css'
import { focusComposerInput } from './composer-focus'
import { renderChatMarkdown } from './chat-markdown'
import type {
  ChatMessageRecord,
  ChatStreamEvent,
  ConversationRecord,
  OpenChatOptions,
  PersonaProfile,
  PetId
} from '../shared/types'
import { PET_IDS, PET_LABELS } from '../shared/types'

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

type ChatView = 'chat' | 'persona' | 'settings'

const els = {
  body: document.body,
  railPetName: document.getElementById('rail-pet-name') as HTMLElement,
  conversationList: document.getElementById('conversation-list') as HTMLElement,
  portraitImage: document.getElementById('portrait-image') as HTMLImageElement,
  portraitName: document.getElementById('portrait-name') as HTMLElement,
  portraitStatus: document.getElementById('portrait-status') as HTMLElement,
  companionCopy: document.getElementById('companion-copy') as HTMLElement,
  emptyState: document.getElementById('empty-state') as HTMLElement,
  messageList: document.getElementById('message-list') as HTMLElement,
  dialogueScroll: document.getElementById('dialogue-scroll') as HTMLElement,
  composer: document.getElementById('composer') as HTMLFormElement,
  composerInput: document.getElementById('composer-input') as HTMLTextAreaElement,
  btnSend: document.getElementById('btn-send') as HTMLButtonElement,
  btnStop: document.getElementById('btn-stop') as HTMLButtonElement,
  btnNewChat: document.getElementById('btn-new-chat') as HTMLButtonElement,
  btnRename: document.getElementById('btn-rename') as HTMLButtonElement,
  btnDelete: document.getElementById('btn-delete') as HTMLButtonElement,
  renameDialog: document.getElementById('rename-dialog') as HTMLDialogElement,
  renameForm: document.getElementById('rename-form') as HTMLFormElement,
  renameInput: document.getElementById('rename-input') as HTMLInputElement,
  btnRenameCancel: document.getElementById(
    'btn-rename-cancel'
  ) as HTMLButtonElement,
  navChat: document.getElementById('nav-chat') as HTMLButtonElement,
  navPersona: document.getElementById('nav-persona') as HTMLButtonElement,
  navSettings: document.getElementById('nav-settings') as HTMLButtonElement,
  viewChat: document.getElementById('view-chat') as HTMLElement,
  viewPersona: document.getElementById('view-persona') as HTMLElement,
  viewSettings: document.getElementById('view-settings') as HTMLElement,
  personaForm: document.getElementById('persona-form') as HTMLFormElement,
  personaCall: document.getElementById('persona-call') as HTMLInputElement,
  personaRelation: document.getElementById('persona-relation') as HTMLInputElement,
  personaPersonality: document.getElementById(
    'persona-personality'
  ) as HTMLSelectElement,
  personaTone: document.getElementById('persona-tone') as HTMLSelectElement,
  personaNotes: document.getElementById('persona-notes') as HTMLTextAreaElement,
  personaStatus: document.getElementById('persona-status') as HTMLElement,
  settingsForm: document.getElementById('settings-form') as HTMLFormElement,
  apiKeyInput: document.getElementById('api-key-input') as HTMLInputElement,
  btnToggleKey: document.getElementById('btn-toggle-key') as HTMLButtonElement,
  btnTestKey: document.getElementById('btn-test-key') as HTMLButtonElement,
  btnClearKey: document.getElementById('btn-clear-key') as HTMLButtonElement,
  keyStatus: document.getElementById('key-status') as HTMLElement,
  settingsStatus: document.getElementById('settings-status') as HTMLElement
}

let currentPetId: PetId = 'doro'
let currentView: ChatView = 'chat'
let conversations: ConversationRecord[] = []
let activeConversationId: string | null = null
let messages: ChatMessageRecord[] = []
let streaming = false
let lastUserContentForRetry: string | null = null
let optimisticMessageIds: {
  user: string
  assistant: string
} | null = null

function isPetId(value: unknown): value is PetId {
  return typeof value === 'string' && (PET_IDS as string[]).includes(value)
}

function setStatus(text: string): void {
  els.portraitStatus.textContent = text
  els.companionCopy.textContent =
    text === '正在回复…'
      ? '正在认真组织语言，请等我一下下～'
      : '想听你说今天的故事 ♡'
}

function setView(view: ChatView): void {
  currentView = view
  els.viewChat.hidden = view !== 'chat'
  els.viewPersona.hidden = view !== 'persona'
  els.viewSettings.hidden = view !== 'settings'
  els.navChat.classList.toggle('active', view === 'chat')
  els.navPersona.classList.toggle('active', view === 'persona')
  els.navSettings.classList.toggle('active', view === 'settings')
}

function applyPet(petId: PetId): void {
  currentPetId = petId
  els.body.dataset.pet = petId
  els.railPetName.textContent = PET_LABELS[petId]
  els.portraitName.textContent = PET_LABELS[petId]
  els.portraitImage.src = PET_IMAGES[petId]
  els.portraitImage.alt = PET_LABELS[petId]
}

async function refreshConversations(selectId?: string | null): Promise<void> {
  conversations = await window.desktopPet.listConversations(currentPetId)
  if (conversations.length === 0) {
    const created = await window.desktopPet.createConversation(currentPetId)
    conversations = [created]
  }
  const preferred =
    selectId && conversations.some((c) => c.id === selectId)
      ? selectId
      : activeConversationId &&
          conversations.some((c) => c.id === activeConversationId)
        ? activeConversationId
        : conversations[0].id
  activeConversationId = preferred
  renderConversationList()
  await loadMessages(preferred)
}

function renderConversationList(): void {
  els.conversationList.replaceChildren()
  for (const item of conversations) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = `conversation-item${
      item.id === activeConversationId ? ' active' : ''
    }`
    button.innerHTML = `<div class="title"></div><div class="preview"></div>`
    ;(button.querySelector('.title') as HTMLElement).textContent = item.title
    ;(button.querySelector('.preview') as HTMLElement).textContent =
      item.lastMessagePreview || '还没有消息'
    button.addEventListener('click', () => {
      void selectConversation(item.id)
    })
    els.conversationList.appendChild(button)
  }
}

async function selectConversation(id: string): Promise<void> {
  if (streaming) {
    await window.desktopPet.stopChatGeneration(activeConversationId ?? undefined)
  }
  activeConversationId = id
  renderConversationList()
  await loadMessages(id)
  setView('chat')
  restoreComposerFocus()
}

async function loadMessages(conversationId: string): Promise<void> {
  messages = await window.desktopPet.getConversationMessages(conversationId)
  streaming = messages.some((m) => m.status === 'streaming')
  syncComposerState()
  renderMessages()
}

function renderMessages(): void {
  els.messageList.replaceChildren()
  const visible = messages.filter((m) => m.role !== 'system')
  els.emptyState.hidden = visible.length > 0

  for (const message of visible) {
    const row = document.createElement('div')
    row.className = `message-row ${message.role}`

    const avatar =
      message.role === 'assistant'
        ? document.createElement('img')
        : document.createElement('div')
    avatar.className = 'message-avatar'
    avatar.classList.add(
      message.role === 'assistant' ? 'assistant-avatar' : 'user-avatar'
    )
    if (avatar instanceof HTMLImageElement) {
      avatar.src = PET_IMAGES[currentPetId]
      avatar.alt = `${PET_LABELS[currentPetId]}头像`
      avatar.draggable = false
    } else {
      avatar.textContent = '你'
      avatar.setAttribute('aria-hidden', 'true')
    }

    const article = document.createElement('article')
    article.className = `message ${message.role}${
      message.status === 'error' ? ' error' : ''
    }`
    article.dataset.messageId = message.id

    const meta = document.createElement('div')
    meta.className = 'meta'
    const who = document.createElement('span')
    who.textContent =
      message.role === 'user' ? '你' : PET_LABELS[currentPetId]
    const state = document.createElement('span')
    state.textContent =
      message.status === 'streaming'
        ? '输入中…'
        : message.status === 'error'
          ? '出错了'
          : message.status === 'cancelled'
            ? '已停止'
            : ''
    meta.append(who, state)

    const body = document.createElement('div')
    body.className = 'content'
    const content =
      message.content || (message.status === 'streaming' ? '…' : '')
    if (message.role === 'assistant') {
      body.innerHTML = renderChatMarkdown(content)
    } else {
      body.textContent = content
    }

    article.append(meta, body)

    if (message.status === 'error') {
      const retry = document.createElement('button')
      retry.type = 'button'
      retry.className = 'btn ghost retry'
      retry.textContent = '重试上一条'
      retry.addEventListener('click', () => {
        void retryLast()
      })
      article.append(retry)
    }

    row.append(avatar, article)
    els.messageList.appendChild(row)
  }

  els.dialogueScroll.scrollTop = els.dialogueScroll.scrollHeight
}

function syncComposerState(): void {
  els.btnStop.hidden = !streaming
  els.btnSend.disabled = streaming
  els.composerInput.disabled = streaming
  setStatus(streaming ? '正在回复…' : '待命中')
}

function restoreComposerFocus(): void {
  if (currentView === 'chat' && !streaming) {
    focusComposerInput(els.composerInput)
  }
}

async function ensureConversation(): Promise<string> {
  if (activeConversationId) return activeConversationId
  const created = await window.desktopPet.createConversation(currentPetId)
  conversations = [created, ...conversations]
  activeConversationId = created.id
  renderConversationList()
  return created.id
}

async function sendCurrent(): Promise<void> {
  const content = els.composerInput.value.trim()
  if (!content || streaming) return

  const keyStatus = await window.desktopPet.getApiKeyStatus()
  if (!keyStatus.configured) {
    setView('settings')
    setFormStatus(els.settingsStatus, '请先配置 DeepSeek API Key', 'err')
    return
  }

  const conversationId = await ensureConversation()
  lastUserContentForRetry = content
  els.composerInput.value = ''
  streaming = true
  syncComposerState()

  // 乐观展示用户消息
  const optimisticStamp = `${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`
  optimisticMessageIds = {
    user: `local-user-${optimisticStamp}`,
    assistant: `local-assistant-${optimisticStamp}`
  }
  messages.push({
    id: optimisticMessageIds.user,
    conversationId,
    role: 'user',
    content,
    createdAt: Date.now(),
    status: 'complete'
  })
  messages.push({
    id: optimisticMessageIds.assistant,
    conversationId,
    role: 'assistant',
    content: '',
    createdAt: Date.now(),
    status: 'streaming'
  })
  renderMessages()

  const result = await window.desktopPet.sendChatMessage({
    conversationId,
    content
  })

  if (!result.ok && result.code === 'missing_api_key') {
    streaming = false
    syncComposerState()
    setView('settings')
    setFormStatus(els.settingsStatus, result.error ?? '请先配置 API Key', 'err')
    await loadMessages(conversationId)
  } else if (!result.ok && result.code !== 'aborted') {
    // 错误详情由 stream event 处理；此处兜底
    streaming = false
    syncComposerState()
    await refreshConversations(conversationId)
    restoreComposerFocus()
  }
}

async function retryLast(): Promise<void> {
  if (!lastUserContentForRetry || streaming) return
  els.composerInput.value = lastUserContentForRetry
  await sendCurrent()
}

function handleStreamEvent(event: ChatStreamEvent): void {
  if (event.conversationId !== activeConversationId) return

  if (event.type === 'start') {
    streaming = true
    syncComposerState()
    if (optimisticMessageIds) {
      const user = messages.find(
        (message) => message.id === optimisticMessageIds?.user
      )
      const assistant = messages.find(
        (message) => message.id === optimisticMessageIds?.assistant
      )
      if (user) user.id = event.userMessageId
      if (assistant) assistant.id = event.assistantMessageId
      optimisticMessageIds = null
      renderMessages()
    } else {
      void loadMessages(event.conversationId)
    }
    return
  }

  if (event.type === 'delta') {
    const target = messages.find((m) => m.id === event.assistantMessageId)
    if (target) {
      target.content += event.delta
      target.status = 'streaming'
      renderMessages()
    } else {
      void loadMessages(event.conversationId)
    }
    return
  }

  if (event.type === 'done') {
    streaming = false
    syncComposerState()
    void refreshConversations(event.conversationId).then(restoreComposerFocus)
    return
  }

  if (event.type === 'error') {
    streaming = false
    syncComposerState()
    void loadMessages(event.conversationId).then(() => {
      if (
        event.code !== 'invalid_api_key' &&
        event.code !== 'missing_api_key'
      ) {
        restoreComposerFocus()
      }
    })
    if (event.code === 'invalid_api_key' || event.code === 'missing_api_key') {
      setView('settings')
      setFormStatus(els.settingsStatus, event.message, 'err')
    }
    return
  }

  if (event.type === 'cancelled') {
    streaming = false
    syncComposerState()
    void loadMessages(event.conversationId).then(restoreComposerFocus)
  }
}

async function loadPersonaForm(): Promise<void> {
  const profile = await window.desktopPet.getPersonaProfile(currentPetId)
  fillPersonaForm(profile)
  setFormStatus(els.personaStatus, '', null)
}

function fillPersonaForm(profile: PersonaProfile): void {
  els.personaCall.value = profile.userCallName
  els.personaRelation.value = profile.relationship
  els.personaPersonality.value = profile.personalityBias
  els.personaTone.value = profile.tonePreference
  els.personaNotes.value = profile.extraNotes
}

function setFormStatus(
  el: HTMLElement,
  text: string,
  kind: 'ok' | 'err' | null
): void {
  el.textContent = text
  el.classList.toggle('ok', kind === 'ok')
  el.classList.toggle('err', kind === 'err')
}

async function refreshKeyStatus(): Promise<void> {
  const status = await window.desktopPet.getApiKeyStatus()
  if (!status.encryptionAvailable) {
    els.keyStatus.textContent = '系统加密不可用，无法安全保存 Key'
  } else if (status.configured) {
    els.keyStatus.textContent = `已配置：${status.masked}`
  } else {
    els.keyStatus.textContent = '未配置'
  }
}

async function applyOpenOptions(options: OpenChatOptions): Promise<void> {
  const petId = isPetId(options.petId) ? options.petId : currentPetId
  if (petId !== currentPetId) {
    applyPet(petId)
    activeConversationId = null
  }
  if (options.view) setView(options.view)
  await refreshConversations(options.conversationId ?? activeConversationId)
  if (options.view === 'persona') await loadPersonaForm()
  if (options.view === 'settings') await refreshKeyStatus()
}

function bindEvents(): void {
  els.btnNewChat.addEventListener('click', () => {
    void (async () => {
      const created = await window.desktopPet.createConversation(currentPetId)
      await refreshConversations(created.id)
      setView('chat')
      restoreComposerFocus()
    })()
  })

  els.btnRename.addEventListener('click', () => {
    if (!activeConversationId) return
    const current = conversations.find((c) => c.id === activeConversationId)
    els.renameInput.value = current?.title ?? ''
    els.renameDialog.showModal()
    els.renameInput.focus()
    els.renameInput.select()
  })

  els.renameForm.addEventListener('submit', (e) => {
    e.preventDefault()
    void (async () => {
      const conversationId = activeConversationId
      const title = els.renameInput.value.trim()
      if (!conversationId || !title) {
        els.renameInput.setCustomValidity('请输入会话名称')
        els.renameInput.reportValidity()
        return
      }
      els.renameInput.setCustomValidity('')
      const updated = await window.desktopPet.renameConversation(
        conversationId,
        title
      )
      if (updated) {
        const index = conversations.findIndex(
          (conversation) => conversation.id === conversationId
        )
        if (index >= 0) conversations[index] = updated
        renderConversationList()
      }
      els.renameDialog.close()
      restoreComposerFocus()
    })()
  })

  els.btnRenameCancel.addEventListener('click', () => {
    els.renameDialog.close()
    restoreComposerFocus()
  })

  els.btnDelete.addEventListener('click', () => {
    void (async () => {
      if (!activeConversationId) return
      const ok = window.confirm('确定删除这个会话吗？消息将无法恢复。')
      if (!ok) return
      await window.desktopPet.deleteConversation(activeConversationId)
      activeConversationId = null
      await refreshConversations(null)
    })()
  })

  els.navChat.addEventListener('click', () => {
    setView('chat')
    restoreComposerFocus()
  })
  els.navPersona.addEventListener('click', () => {
    setView('persona')
    void loadPersonaForm()
  })
  els.navSettings.addEventListener('click', () => {
    setView('settings')
    void refreshKeyStatus()
  })

  els.composer.addEventListener('submit', (e) => {
    e.preventDefault()
    void sendCurrent()
  })

  els.composerInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void sendCurrent()
    }
  })

  els.btnStop.addEventListener('click', () => {
    void window.desktopPet.stopChatGeneration(
      activeConversationId ?? undefined
    )
  })

  els.personaForm.addEventListener('submit', (e) => {
    e.preventDefault()
    void (async () => {
      await window.desktopPet.updatePersonaProfile({
        petId: currentPetId,
        fields: {
          userCallName: els.personaCall.value,
          relationship: els.personaRelation.value,
          personalityBias: els.personaPersonality
            .value as PersonaProfile['personalityBias'],
          tonePreference: els.personaTone
            .value as PersonaProfile['tonePreference'],
          extraNotes: els.personaNotes.value
        }
      })
      setFormStatus(els.personaStatus, '已保存', 'ok')
    })()
  })

  els.settingsForm.addEventListener('submit', (e) => {
    e.preventDefault()
    void (async () => {
      try {
        const status = await window.desktopPet.setApiKey(els.apiKeyInput.value)
        els.apiKeyInput.value = ''
        await refreshKeyStatus()
        setFormStatus(
          els.settingsStatus,
          status.configured ? 'API Key 已保存' : '保存失败',
          status.configured ? 'ok' : 'err'
        )
      } catch (error) {
        setFormStatus(
          els.settingsStatus,
          error instanceof Error ? error.message : '保存失败',
          'err'
        )
      }
    })()
  })

  els.btnToggleKey.addEventListener('click', () => {
    const showing = els.apiKeyInput.type === 'text'
    els.apiKeyInput.type = showing ? 'password' : 'text'
    els.btnToggleKey.textContent = showing ? '显示' : '隐藏'
  })

  els.btnTestKey.addEventListener('click', () => {
    void (async () => {
      setFormStatus(els.settingsStatus, '测试中…', null)
      const draft = els.apiKeyInput.value.trim()
      const result = await window.desktopPet.testApiKey(
        draft ? draft : undefined
      )
      setFormStatus(
        els.settingsStatus,
        result.message,
        result.ok ? 'ok' : 'err'
      )
    })()
  })

  els.btnClearKey.addEventListener('click', () => {
    void (async () => {
      const ok = window.confirm('确定删除本机保存的 API Key 吗？')
      if (!ok) return
      await window.desktopPet.clearApiKey()
      els.apiKeyInput.value = ''
      await refreshKeyStatus()
      setFormStatus(els.settingsStatus, '已删除 API Key', 'ok')
    })()
  })

  window.desktopPet.onChatStream(handleStreamEvent)
  window.desktopPet.onChatOpenOptions((options) => {
    void applyOpenOptions(options)
  })
  window.desktopPet.onConfigChanged((config) => {
    if (config.petId !== currentPetId) {
      void applyOpenOptions({ petId: config.petId, view: currentView })
    }
  })
}

async function bootstrap(): Promise<void> {
  bindEvents()
  const config = await window.desktopPet.getConfig()
  applyPet(config.petId)
  const pending = await window.desktopPet.getChatOpenOptions()
  if (pending) {
    await applyOpenOptions({
      petId: pending.petId ?? config.petId,
      view: pending.view ?? 'chat',
      conversationId: pending.conversationId
    })
  } else {
    setView('chat')
    await refreshConversations(null)
  }
  await refreshKeyStatus()
}

void bootstrap()
