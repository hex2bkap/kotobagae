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
    theme: 'light' | 'dark' | 'washi' | 'sumi'
    showWritingStats: boolean
    wordGoal: number  // 0 = 無効
    fontSize: number          // px（既定 16）
    fontFamily: string        // 既定 "Yu Gothic UI"
    textColorLight: string    // ライト/和紙テーマ用文字色（既定 ''=テーマ既定値）
    textColorDark: string     // ダーク/墨夜テーマ用文字色（既定 ''=テーマ既定値）
    boldText: boolean         // 全文太字
    wordWrap: boolean         // 折り返し
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
  display: {
    theme: 'washi',
    showWritingStats: false,
    wordGoal: 0,
    fontSize: 16,
    fontFamily: 'Yu Gothic UI',
    textColorLight: '',
    textColorDark: '',
    boldText: false,
    wordWrap: true
  },
  dictPriorityOrder: [],
  defaultDictNames: []
}

export interface AutosaveFileInfo {
  path: string
  name: string
  mtime: number
  preview: string
}
