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
  display: {
    theme: 'light' | 'dark'
    showWritingStats: boolean
    wordGoal: number  // 0 = 無効
  }
}

export const DEFAULT_SETTINGS: AppSettings = {
  windowBounds: null,
  dictWindowBounds: null,
  autosave: { enabled: true, intervalMinutes: 5, maxAgeDays: 30 },
  dictSort: { byFrequency: true, showCount: false },
  display: { theme: 'light', showWritingStats: false, wordGoal: 0 }
}

export interface AutosaveFileInfo {
  path: string
  name: string
  mtime: number
  preview: string
}
