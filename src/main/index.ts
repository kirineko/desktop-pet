import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  screen,
  Tray
} from 'electron'
import { join } from 'path'
import { resolveAppIcon, resolveTrayIcon } from './icons'
import { transformBackendProductCodes } from './services/amazon/normalize'
import { closeDb } from './services/db'
import { JobQueue } from './services/job-queue'
import { StockPetDataSource } from './services/pet-data-source'
import { broadcastToPanel, openPanelWindow } from './panel'
import { loadConfig, saveConfig } from './store'
import {
  DEFAULT_CONFIG,
  PET_IDS,
  PET_LABELS,
  type CreateJobInput,
  type ItemFilter,
  type PetBusinessEvent,
  type PetConfig,
  type PetId
} from '../shared/types'

const WINDOW_WIDTH = 180
const WINDOW_HEIGHT = 240

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let config: PetConfig = { ...DEFAULT_CONFIG }

const jobQueue = new JobQueue()
const dataSource = new StockPetDataSource(jobQueue)

const isDev = !app.isPackaged

function broadcastConfig(): void {
  mainWindow?.webContents.send('config-changed', config)
}

function persist(): void {
  saveConfig(config)
  broadcastConfig()
}

function clampToVisibleWorkArea(
  x: number,
  y: number
): { x: number; y: number } {
  const displays = screen.getAllDisplays()
  const onScreen = displays.some((d) => {
    const a = d.workArea
    return (
      x + WINDOW_WIDTH > a.x &&
      x < a.x + a.width &&
      y + WINDOW_HEIGHT > a.y &&
      y < a.y + a.height
    )
  })
  if (onScreen) return { x, y }

  const primary = screen.getPrimaryDisplay().workArea
  return {
    x: primary.x + primary.width - WINDOW_WIDTH - 24,
    y: primary.y + 80
  }
}

function createWindow(): void {
  const display = screen.getPrimaryDisplay().workArea
  const defaultX = display.x + display.width - WINDOW_WIDTH - 24
  const defaultY = display.y + 80
  const clamped = clampToVisibleWorkArea(
    config.windowX ?? defaultX,
    config.windowY ?? defaultY
  )
  const x = clamped.x
  const y = clamped.y
  config.windowX = x
  config.windowY = y

  const appIcon = resolveAppIcon()
  mainWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    x,
    y,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: config.alwaysOnTop,
    show: false,
    backgroundColor: '#00000000',
    ...(appIcon.isEmpty() ? {} : { icon: appIcon }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  if (process.platform === 'darwin') {
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  }

  mainWindow.setAlwaysOnTop(config.alwaysOnTop, 'screen-saver')

  mainWindow.once('ready-to-show', () => {
    // 每次启动都显示宠物，避免「隐藏」被持久化后无法恢复
    showPet()
  })

  mainWindow.on('moved', () => {
    if (!mainWindow) return
    const [wx, wy] = mainWindow.getPosition()
    config.windowX = wx
    config.windowY = wy
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function buildPetSubmenu(
  onSelect: (petId: PetId) => void
): Electron.MenuItemConstructorOptions[] {
  return PET_IDS.map((petId) => ({
    label: PET_LABELS[petId],
    type: 'radio',
    checked: config.petId === petId,
    click: () => onSelect(petId)
  }))
}

function setPetId(petId: PetId): void {
  config.petId = petId
  persist()
  rebuildTrayMenu()
}

function syncDockForVisibility(): void {
  if (process.platform !== 'darwin' || !app.dock) return
  // 隐藏宠物时露出 Dock，方便点击图标恢复；显示时再藏 Dock，保持桌宠形态
  if (config.visible) {
    app.dock.hide()
  } else {
    app.dock.show()
  }
}

function showPet(): void {
  if (!mainWindow) {
    createWindow()
  }
  if (!mainWindow) return
  const [wx, wy] = mainWindow.getPosition()
  const clamped = clampToVisibleWorkArea(wx, wy)
  if (clamped.x !== wx || clamped.y !== wy) {
    mainWindow.setPosition(clamped.x, clamped.y)
    config.windowX = clamped.x
    config.windowY = clamped.y
  }
  config.visible = true
  mainWindow.show()
  mainWindow.focus()
  persist()
  syncDockForVisibility()
  rebuildTrayMenu()
}

function hidePet(): void {
  if (!mainWindow) return
  config.visible = false
  mainWindow.hide()
  persist()
  syncDockForVisibility()
  rebuildTrayMenu()
}

function toggleVisible(): void {
  if (!mainWindow) return
  if (mainWindow.isVisible() && config.visible) {
    hidePet()
  } else {
    showPet()
  }
}

function setAlwaysOnTop(value: boolean): void {
  config.alwaysOnTop = value
  mainWindow?.setAlwaysOnTop(value, 'screen-saver')
  persist()
  rebuildTrayMenu()
}

function jobControlMenuItems(): Electron.MenuItemConstructorOptions[] {
  const active = jobQueue.getActiveJob()
  if (!active) return []
  const items: Electron.MenuItemConstructorOptions[] = [{ type: 'separator' }]
  if (active.status === 'running') {
    items.push({
      label: '暂停查询',
      click: () => jobQueue.pauseJob()
    })
  }
  if (active.status === 'paused') {
    items.push({
      label: '继续查询',
      click: () => jobQueue.resumeJob()
    })
  }
  if (
    active.status === 'running' ||
    active.status === 'paused' ||
    active.status === 'pending'
  ) {
    items.push({
      label: '取消查询',
      click: () => jobQueue.cancelJob()
    })
  }
  return items
}

function showAppContextMenu(): void {
  if (!mainWindow) return
  const menu = Menu.buildFromTemplate([
    {
      label: '打开库存面板',
      click: () => openPanelWindow()
    },
    ...jobControlMenuItems(),
    { type: 'separator' },
    {
      label: '切换宠物',
      submenu: buildPetSubmenu(setPetId)
    },
    {
      label: config.alwaysOnTop ? '取消置顶' : '始终置顶',
      click: () => setAlwaysOnTop(!config.alwaysOnTop)
    },
    { type: 'separator' },
    {
      label: config.visible ? '隐藏宠物' : '显示宠物',
      click: () => toggleVisible()
    },
    {
      label: '退出',
      click: () => app.quit()
    }
  ])
  menu.popup({ window: mainWindow })
}

function createTray(): void {
  tray = new Tray(resolveTrayIcon())
  if (process.platform === 'darwin') {
    tray.setTitle(config.visible ? '🐾' : '显示')
  }
  tray.setToolTip(config.visible ? '桌面宠物' : '桌面宠物（已隐藏，点击显示）')
  rebuildTrayMenu()
  tray.on('click', () => {
    if (!mainWindow || !mainWindow.isVisible() || !config.visible) {
      showPet()
      return
    }
    mainWindow.focus()
  })
  tray.on('right-click', () => {
    tray?.popUpContextMenu()
  })
  tray.on('double-click', () => {
    openPanelWindow()
  })
}

function rebuildTrayMenu(): void {
  if (!tray) return
  if (process.platform === 'darwin') {
    tray.setTitle(config.visible ? '🐾' : '显示')
  }
  tray.setToolTip(config.visible ? '桌面宠物' : '桌面宠物（已隐藏，点击显示）')

  const menu = Menu.buildFromTemplate([
    {
      label: config.visible ? '隐藏宠物' : '显示宠物',
      click: () => toggleVisible()
    },
    {
      label: '打开库存面板',
      click: () => openPanelWindow()
    },
    ...jobControlMenuItems(),
    { type: 'separator' },
    {
      label: '切换宠物',
      submenu: buildPetSubmenu(setPetId)
    },
    {
      label: '始终置顶',
      type: 'checkbox',
      checked: config.alwaysOnTop,
      click: (item) => setAlwaysOnTop(item.checked)
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => app.quit()
    }
  ])
  tray.setContextMenu(menu)
}

function registerIpc(): void {
  ipcMain.handle('get-config', () => config)

  ipcMain.handle('set-pet-id', (_event, petId: PetId) => {
    setPetId(petId)
    return config
  })

  ipcMain.handle('set-always-on-top', (_event, value: boolean) => {
    setAlwaysOnTop(value)
    return config
  })

  ipcMain.handle('move-window', (_event, dx: number, dy: number) => {
    if (!mainWindow) return
    const [x, y] = mainWindow.getPosition()
    mainWindow.setPosition(Math.round(x + dx), Math.round(y + dy))
  })

  ipcMain.handle('save-position', () => {
    if (!mainWindow) return
    const [x, y] = mainWindow.getPosition()
    config.windowX = x
    config.windowY = y
    persist()
  })

  ipcMain.handle('show-context-menu', () => {
    showAppContextMenu()
  })

  ipcMain.handle('open-panel', () => {
    openPanelWindow()
  })

  ipcMain.handle('show-pet', () => {
    showPet()
  })

  ipcMain.handle('get-network-status', () => jobQueue.getNetworkStatus())

  ipcMain.handle('get-job-status', () => dataSource.getStatus())

  ipcMain.handle('create-job', (_event, input: CreateJobInput) => {
    const result = jobQueue.createJob(input)
    rebuildTrayMenu()
    return result
  })

  ipcMain.handle('pause-job', () => {
    const job = jobQueue.pauseJob()
    rebuildTrayMenu()
    return job
  })

  ipcMain.handle('resume-job', () => {
    const job = jobQueue.resumeJob()
    rebuildTrayMenu()
    return job
  })

  ipcMain.handle('cancel-job', () => {
    const job = jobQueue.cancelJob()
    rebuildTrayMenu()
    return job
  })

  ipcMain.handle('delete-job', (_event, jobId: string) => {
    const result = jobQueue.deleteJob(jobId)
    rebuildTrayMenu()
    return result
  })

  ipcMain.handle('get-active-job', () => jobQueue.getActiveJob())

  ipcMain.handle('list-jobs', (_event, limit?: number) =>
    jobQueue.listJobs(limit ?? 20)
  )

  ipcMain.handle('get-job', (_event, jobId: string) => jobQueue.getJob(jobId))

  ipcMain.handle(
    'get-job-items',
    (
      _event,
      jobId: string,
      filter: ItemFilter,
      offset?: number,
      limit?: number
    ) => jobQueue.getJobItems(jobId, filter, offset ?? 0, limit ?? 100)
  )

  ipcMain.handle('transform-codes', (_event, text: string) =>
    transformBackendProductCodes(text)
  )

  ipcMain.handle('export-failed', (_event, jobId: string) =>
    jobQueue.exportFailed(jobId)
  )

  ipcMain.handle('export-out-of-stock', (_event, jobId: string) =>
    jobQueue.exportOutOfStock(jobId)
  )
}

function wireBusinessEvents(): void {
  dataSource.onEvent((event: PetBusinessEvent) => {
    mainWindow?.webContents.send('business-event', event)
  })
  dataSource.start()

  jobQueue.onJobUpdated((job) => {
    broadcastToPanel('job-updated', job)
    rebuildTrayMenu()
  })
}

if (process.platform === 'win32') {
  app.setAppUserModelId('com.kirineko.desktoppet')
}

app.whenReady().then(() => {
  config = loadConfig()
  // 启动时强制可见，清掉上次「隐藏」导致的无法恢复状态
  config.visible = true

  const appIcon = resolveAppIcon()
  if (!appIcon.isEmpty() && process.platform === 'darwin') {
    app.dock?.setIcon(appIcon)
  }

  registerIpc()
  createWindow()
  createTray()
  wireBusinessEvents()
  syncDockForVisibility()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
    showPet()
  })
})

app.on('window-all-closed', () => {
  if (!tray) {
    app.quit()
  }
})

app.on('before-quit', () => {
  dataSource.stop()
  closeDb()
  if (mainWindow) {
    const [x, y] = mainWindow.getPosition()
    config.windowX = x
    config.windowY = y
    saveConfig(config)
  }
})
