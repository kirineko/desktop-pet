import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { DEFAULT_CONFIG, type PetConfig, type PetId, PET_IDS } from '../shared/types'

function configPath(): string {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return join(dir, 'pet-config.json')
}

function isPetId(value: unknown): value is PetId {
  return typeof value === 'string' && (PET_IDS as string[]).includes(value)
}

export function loadConfig(): PetConfig {
  try {
    const raw = readFileSync(configPath(), 'utf-8')
    const parsed = JSON.parse(raw) as Partial<PetConfig>
    return {
      petId: isPetId(parsed.petId) ? parsed.petId : DEFAULT_CONFIG.petId,
      alwaysOnTop:
        typeof parsed.alwaysOnTop === 'boolean'
          ? parsed.alwaysOnTop
          : DEFAULT_CONFIG.alwaysOnTop,
      windowX: typeof parsed.windowX === 'number' ? parsed.windowX : null,
      windowY: typeof parsed.windowY === 'number' ? parsed.windowY : null,
      visible: typeof parsed.visible === 'boolean' ? parsed.visible : true
    }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

export function saveConfig(config: PetConfig): void {
  writeFileSync(configPath(), JSON.stringify(config, null, 2), 'utf-8')
}
