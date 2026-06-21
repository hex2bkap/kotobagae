import { ElectronAPI } from '@electron-toolkit/preload'

interface SearchResult {
  reading: string
  candidates: string[]
}

interface SessionTab {
  filePath: string | null
  cursorPos: number
  dictName: string | null
}

interface SessionData {
  tabs: SessionTab[]
  activeTabIndex: number
}

interface SettingsData {
  windowBounds: { x: number; y: number; width: number; height: number } | null
  autosave: { enabled: boolean; intervalMinutes: number; maxAgeDays: number }
  dictSort: { byFrequency: boolean; showCount: boolean }
  display: { theme: 'light' | 'dark'; showWritingStats: boolean; wordGoal: number }
}

interface AutosaveFileInfo {
  path: string
  name: string
  mtime: number
  preview: string
}

interface DictEntryInfo {
  word: string
  memo: string
  count: number
}

interface KotobagaeAPI {
  openFile: () => Promise<{ path: string; content: string; encoding: string } | null>
  openFilePath: (filePath: string) => Promise<{ path: string; content: string; encoding: string } | null>
  saveFile: (filePath: string, content: string) => Promise<{ success: boolean; error?: string }>
  saveFileAs: (content: string) => Promise<{ path: string; success: boolean; error?: string } | null>
  setTitle: (title: string) => void
  confirmClose: () => void
  onMenuNew: (cb: () => void) => () => void
  onMenuOpen: (cb: () => void) => () => void
  onMenuSave: (cb: () => void) => () => void
  onMenuSaveAs: (cb: () => void) => () => void
  onMenuSettings: (cb: () => void) => () => void
  onMenuAutosaveRestore: (cb: () => void) => () => void
  onBeforeClose: (cb: () => void) => () => void
  onAppOpenFile: (cb: (filePath: string) => void) => () => void
  loadSession: () => Promise<SessionData | null>
  saveSession: (data: SessionData) => Promise<void>
  settings: {
    load: () => Promise<SettingsData>
    save: (s: SettingsData) => Promise<void>
  }
  autosave: {
    save: (content: string, baseName: string) => Promise<void>
    list: () => Promise<AutosaveFileInfo[]>
    open: (filePath: string) => Promise<string | null>
  }
  openDataDir: () => void
  dict: {
    listDicts: () => Promise<string[]>
    getActiveDict: () => Promise<string | null>
    setActiveDict: (name: string | null) => Promise<void>
    getCandidates: (textBeforeCursor: string) => Promise<SearchResult | null>
    addEntry: (reading: string, candidates: string[]) => Promise<boolean>
    createDict: (name: string) => Promise<boolean>
    openManager: () => Promise<void>
    getDictData: (name: string) => Promise<Record<string, DictEntryInfo[]>>
    updateEntry: (dictName: string, reading: string, index: number, patch: { word?: string; memo?: string; count?: number }) => Promise<boolean>
    removeCandidate: (dictName: string, reading: string, index: number) => Promise<void>
    addCandidate: (dictName: string, reading: string, word: string) => Promise<boolean>
    renameReading: (dictName: string, oldReading: string, newReading: string) => Promise<boolean>
    removeReading: (dictName: string, reading: string) => Promise<void>
    renameDict: (oldName: string, newName: string) => Promise<boolean>
    deleteDict: (name: string) => Promise<void>
    copyDict: (src: string, dst: string) => Promise<boolean>
    exportTsv: (dictName: string) => Promise<{ success: boolean; count: number }>
    importTsv: (dictName: string) => Promise<{ success: boolean; count: number }>
    recordUsage: (dictName: string, reading: string, word: string) => Promise<void>
    notifyListUpdated: () => Promise<void>
    onListUpdated: (cb: () => void) => () => void
  }
  contextMenu: {
    show: (hasSelection: boolean) => void
    onDictRegister: (cb: () => void) => () => void
  }
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: KotobagaeAPI
  }
}
