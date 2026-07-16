import { BrowserWindow, app, shell } from 'electron'
import { join } from 'path'
import { resolveAppIcon } from './icons'

const PANEL_WIDTH = 1200
const PANEL_HEIGHT = 820

let panelWindow: BrowserWindow | null = null

const isDev = !app.isPackaged

export function getPanelWindow(): BrowserWindow | null {
  return panelWindow
}

export function openPanelWindow(): void {
  if (panelWindow && !panelWindow.isDestroyed()) {
    if (panelWindow.isMinimized()) panelWindow.restore()
    if (!panelWindow.isMaximized()) panelWindow.maximize()
    panelWindow.show()
    panelWindow.focus()
    return
  }

  const appIcon = resolveAppIcon()
  panelWindow = new BrowserWindow({
    width: PANEL_WIDTH,
    height: PANEL_HEIGHT,
    minWidth: 720,
    minHeight: 560,
    title: '库存查询',
    show: false,
    backgroundColor: '#faf7f0',
    autoHideMenuBar: true,
    ...(appIcon.isEmpty() ? {} : { icon: appIcon }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  panelWindow.once('ready-to-show', () => {
    panelWindow?.maximize()
    panelWindow?.show()
  })

  panelWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  panelWindow.on('closed', () => {
    panelWindow = null
  })

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    const base = process.env.ELECTRON_RENDERER_URL.replace(/\/$/, '')
    panelWindow.loadURL(`${base}/panel.html`)
  } else {
    panelWindow.loadFile(join(__dirname, '../renderer/panel.html'))
  }
}

export function broadcastToPanel(channel: string, payload: unknown): void {
  if (panelWindow && !panelWindow.isDestroyed()) {
    panelWindow.webContents.send(channel, payload)
  }
}
