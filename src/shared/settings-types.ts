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
  // M7: グローバル辞書優先度（管理画面で設定。先頭が最優先）
  dictPriorityOrder: string[]
  // M7追跡: 新規タブで既定有効にする辞書名リスト
  defaultDictNames: string[]
}

export const DEFAULT_SETTINGS: AppSettings = {
  windowBounds: null,
  dictWindowBounds: null,
  autosave: { enabled: true, intervalMinutes: 5, maxAgeDays: 30 },
  dictSort: { byFrequency: true, showCount: false },
  display: { theme: 'light', showWritingStats: false, wordGoal: 0 },
  dictPriorityOrder: [],
  defaultDictNames: []
}

export interface AutosaveFileInfo {
  path: string
  name: string
  mtime: number
  preview: string
}
