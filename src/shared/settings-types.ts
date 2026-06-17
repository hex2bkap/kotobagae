export interface AppSettings {
  windowBounds: { x: number; y: number; width: number; height: number } | null
  dictWindowBounds?: { x: number; y: number; width: number; height: number } | null
  autosave: {
    enabled: boolean
    intervalMinutes: number
    maxAgeDays: number
  }
  dictSort: {
    byFrequency: boolean
    showCount: boolean
  }
}

export const DEFAULT_SETTINGS: AppSettings = {
  windowBounds: null,
  dictWindowBounds: null,
  autosave: { enabled: true, intervalMinutes: 5, maxAgeDays: 30 },
  dictSort: { byFrequency: true, showCount: false }
}

export interface AutosaveFileInfo {
  path: string
  name: string
  mtime: number
  preview: string
}
