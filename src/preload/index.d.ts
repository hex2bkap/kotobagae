import { ElectronAPI } from '@electron-toolkit/preload'

interface SearchResult {
  reading: string
  candidates: string[]
}

interface KotobagaeAPI {
  openFile: () => Promise<{ path: string; content: string; encoding: string } | null>
  saveFile: (filePath: string, content: string) => Promise<{ success: boolean; error?: string }>
  saveFileAs: (content: string) => Promise<{ path: string; success: boolean; error?: string } | null>
  setTitle: (title: string) => void
  onMenuNew: (cb: () => void) => () => void
  onMenuOpen: (cb: () => void) => () => void
  onMenuSave: (cb: () => void) => () => void
  onMenuSaveAs: (cb: () => void) => () => void
  dict: {
    listDicts: () => Promise<string[]>
    getActiveDict: () => Promise<string | null>
    setActiveDict: (name: string | null) => Promise<void>
    getCandidates: (textBeforeCursor: string) => Promise<SearchResult | null>
    addEntry: (reading: string, candidates: string[]) => Promise<boolean>
    createDict: (name: string) => Promise<boolean>
  }
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: KotobagaeAPI
  }
}
