import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type {
  ChatStreamEvent,
  CreateJobInput,
  DesktopPetApi,
  ItemFilter,
  JobRecord,
  OpenChatOptions,
  PetBusinessEvent,
  PetConfig,
  PetId,
  SendChatMessageInput,
  UpdatePersonaInput
} from '../shared/types'

const api: DesktopPetApi = {
  getConfig: () => ipcRenderer.invoke('get-config'),
  setPetId: (petId: PetId) => ipcRenderer.invoke('set-pet-id', petId),
  setAlwaysOnTop: (value: boolean) =>
    ipcRenderer.invoke('set-always-on-top', value),
  moveWindow: (dx: number, dy: number) =>
    ipcRenderer.invoke('move-window', dx, dy),
  savePosition: () => ipcRenderer.invoke('save-position'),
  showContextMenu: () => ipcRenderer.invoke('show-context-menu'),
  openPanel: () => ipcRenderer.invoke('open-panel'),
  openChat: (options?: OpenChatOptions) =>
    ipcRenderer.invoke('open-chat', options ?? {}),
  getChatOpenOptions: () => ipcRenderer.invoke('get-chat-open-options'),
  showPet: () => ipcRenderer.invoke('show-pet'),
  getNetworkStatus: () => ipcRenderer.invoke('get-network-status'),
  getJobStatus: () => ipcRenderer.invoke('get-job-status'),
  getSessionSummary: () => ipcRenderer.invoke('get-session-summary'),
  createJob: (input: CreateJobInput) => ipcRenderer.invoke('create-job', input),
  pauseJob: (jobId: string) => ipcRenderer.invoke('pause-job', jobId),
  resumeJob: (jobId: string) => ipcRenderer.invoke('resume-job', jobId),
  cancelJob: (jobId: string) => ipcRenderer.invoke('cancel-job', jobId),
  deleteJob: (jobId: string) => ipcRenderer.invoke('delete-job', jobId),
  getActiveJob: () => ipcRenderer.invoke('get-active-job'),
  listJobs: (limit?: number) => ipcRenderer.invoke('list-jobs', limit),
  getJob: (jobId: string) => ipcRenderer.invoke('get-job', jobId),
  getJobItems: (
    jobId: string,
    filter: ItemFilter,
    offset?: number,
    limit?: number
  ) => ipcRenderer.invoke('get-job-items', jobId, filter, offset, limit),
  transformCodes: (text: string) =>
    ipcRenderer.invoke('transform-codes', text),
  exportFailed: (jobId: string) => ipcRenderer.invoke('export-failed', jobId),
  exportOutOfStock: (jobId: string) =>
    ipcRenderer.invoke('export-out-of-stock', jobId),
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  getApiKeyStatus: () => ipcRenderer.invoke('get-api-key-status'),
  setApiKey: (apiKey: string) => ipcRenderer.invoke('set-api-key', apiKey),
  clearApiKey: () => ipcRenderer.invoke('clear-api-key'),
  testApiKey: (apiKey?: string) => ipcRenderer.invoke('test-api-key', apiKey),
  getPersonaProfile: (petId: PetId) =>
    ipcRenderer.invoke('get-persona-profile', petId),
  updatePersonaProfile: (input: UpdatePersonaInput) =>
    ipcRenderer.invoke('update-persona-profile', input),
  listConversations: (petId: PetId) =>
    ipcRenderer.invoke('list-conversations', petId),
  createConversation: (petId: PetId, title?: string) =>
    ipcRenderer.invoke('create-conversation', petId, title),
  renameConversation: (conversationId: string, title: string) =>
    ipcRenderer.invoke('rename-conversation', conversationId, title),
  deleteConversation: (conversationId: string) =>
    ipcRenderer.invoke('delete-conversation', conversationId),
  getConversationMessages: (conversationId: string) =>
    ipcRenderer.invoke('get-conversation-messages', conversationId),
  sendChatMessage: (input: SendChatMessageInput) =>
    ipcRenderer.invoke('send-chat-message', input),
  stopChatGeneration: (conversationId?: string) =>
    ipcRenderer.invoke('stop-chat-generation', conversationId),
  onConfigChanged: (cb) => {
    const listener = (_event: IpcRendererEvent, config: PetConfig): void => {
      cb(config)
    }
    ipcRenderer.on('config-changed', listener)
    return () => {
      ipcRenderer.removeListener('config-changed', listener)
    }
  },
  onBusinessEvent: (cb) => {
    const listener = (
      _event: IpcRendererEvent,
      businessEvent: PetBusinessEvent
    ): void => {
      cb(businessEvent)
    }
    ipcRenderer.on('business-event', listener)
    return () => {
      ipcRenderer.removeListener('business-event', listener)
    }
  },
  onJobUpdated: (cb) => {
    const listener = (
      _event: IpcRendererEvent,
      job: JobRecord | null
    ): void => {
      cb(job)
    }
    ipcRenderer.on('job-updated', listener)
    return () => {
      ipcRenderer.removeListener('job-updated', listener)
    }
  },
  onChatStream: (cb) => {
    const listener = (
      _event: IpcRendererEvent,
      streamEvent: ChatStreamEvent
    ): void => {
      cb(streamEvent)
    }
    ipcRenderer.on('chat-stream', listener)
    return () => {
      ipcRenderer.removeListener('chat-stream', listener)
    }
  },
  onChatOpenOptions: (cb) => {
    const listener = (
      _event: IpcRendererEvent,
      options: OpenChatOptions
    ): void => {
      cb(options)
    }
    ipcRenderer.on('chat-open-options', listener)
    return () => {
      ipcRenderer.removeListener('chat-open-options', listener)
    }
  }
}

contextBridge.exposeInMainWorld('desktopPet', api)
