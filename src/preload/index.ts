import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type {
  CreateJobInput,
  DesktopPetApi,
  ItemFilter,
  JobRecord,
  PetBusinessEvent,
  PetConfig,
  PetId
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
  showPet: () => ipcRenderer.invoke('show-pet'),
  getNetworkStatus: () => ipcRenderer.invoke('get-network-status'),
  getJobStatus: () => ipcRenderer.invoke('get-job-status'),
  createJob: (input: CreateJobInput) => ipcRenderer.invoke('create-job', input),
  pauseJob: () => ipcRenderer.invoke('pause-job'),
  resumeJob: () => ipcRenderer.invoke('resume-job'),
  cancelJob: () => ipcRenderer.invoke('cancel-job'),
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
  }
}

contextBridge.exposeInMainWorld('desktopPet', api)
