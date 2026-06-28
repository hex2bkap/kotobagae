import { ElectronAPI } from '@electron-toolkit/preload'

interface CandidateWithSource {
  word: string
  dictName: string
}

interface MultiSearchResult {
  reading: string
  candidates: CandidateWithSource[]
}

interface SessionTab {
  filePath: string | null
  cursorPos: number
  dictNames: string[]
  dictName?: string | null
}

interface SessionData {
  tabs: SessionTab[]
  activeTabIndex: number
}

interface SettingsData {
  windowBounds: { x: number; y: number; width: number; height: number } | null
  dictWindowBounds?: { x: number; y: number; width: number; height: number } | null
  autosave: { enabled: boolean; intervalMinutes: number; maxAgeDays: number }
  dictSort: { byFrequency: boolean; showCount: boolean; maxSearchLen: number }
  display: {
    theme: 'light' | 'dark' | 'washi' | 'sumi'
    showWritingStats: boolean
    wordGoal: number
    fontSize: number
    fontFamily: string
    textColorLight: string
    textColorDark: string
    boldText: boolean
    wordWrap: boolean
  }
  dictPriorityOrder: string[]
  defaultDictNames: string[]
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
  onMenuShortcuts: (cb: () => void) => () => void
  onMenuAbout: (cb: () => void) => () => void
  onMenuDisplay: (cb: (action: string, value?: unknown) => void) => () => void
  onBeforeClose: (cb: () => void) => () => void
  onAppOpenFile: (cb: (filePath: string) => void) => () => void
  loadSession: () => Promise<{
    tabs: Array<{ filePath: string | null; cursorPos: number; dictNames: string[]; dictName?: string | null }>
    activeTabIndex: number
  } | null>
  saveSession: (data: { tabs: Array<{ filePath: string | null; cursorPos: number; dictNames: string[] }>; activeTabIndex: number }) => Promise<void>
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
  openAutosaveDir: () => void
  dict: {
    listDicts: () => Promise<string[]>
    getActiveDicts: () => Promise<string[]>
    setActiveDicts: (names: string[]) => Promise<void>
    getCandidates: (textBeforeCursor: string) => Promise<MultiSearchResult | null>
    addEntry: (dictName: string, reading: string, candidates: string[]) => Promise<boolean>
    getPriorityOrder: () => Promise<string[]>
    setPriorityOrder: (order: string[]) => Promise<void>
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
