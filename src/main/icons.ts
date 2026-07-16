import { app, nativeImage, type NativeImage } from 'electron'
import { join } from 'path'

function candidatePaths(fileName: string): string[] {
  return [
    join(process.resourcesPath, fileName),
    join(app.getAppPath(), 'resources', fileName),
    join(__dirname, '../../resources', fileName)
  ]
}

function loadImage(fileName: string): NativeImage | null {
  for (const path of candidatePaths(fileName)) {
    const image = nativeImage.createFromPath(path)
    if (!image.isEmpty()) return image
  }
  return null
}

/** 任务栏 / 窗口图标（菲比） */
export function resolveAppIcon(): NativeImage {
  return (
    loadImage('icon.png') ||
    loadImage('tray.png') ||
    nativeImage.createEmpty()
  )
}

/** 系统托盘图标（菲比，按平台缩放到合适尺寸） */
export function resolveTrayIcon(): NativeImage {
  const source = loadImage('tray.png') || loadImage('icon.png')
  if (!source) {
    return nativeImage.createFromDataURL(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAFUlEQVQ4T2NkYGD4z0ABYBzVMKoBAAgwAgE1r1iSAAAAAElFTkSuQmCC'
    )
  }

  const size = process.platform === 'win32' ? 32 : 18
  return source.resize({ width: size, height: size })
}
