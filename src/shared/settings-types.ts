export interface AppSettings {
  windowBounds: { x: number; y: number; width: number; height: number } | null
  dictWindowBounds?: { x: number; y: number; width: number; height: number } | null
  autosave: {
    enabled: boolean
    intervalMinutes: number
    maxAgeDays: number
  }
}

export const DEFAULT_SETTINGS: AppSettings = {
  windowBounds: null,
  dictWindowBounds: null,
  autosave: { enabled: true, intervalMinutes: 5, maxAgeDays: 30 }
}

export interface AutosaveFileInfo {
  path: string
  name: string
  mtime: number
  preview: string
}
