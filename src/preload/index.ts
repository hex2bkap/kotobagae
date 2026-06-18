import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  openFile: () =>
    ipcRenderer.invoke('file:open') as Promise<{
      path: string
      content: string
      encoding: string
    } | null>,

  openFilePath: (filePath: string) =>
    ipcRenderer.invoke('file:openPath', filePath) as Promise<{
      path: string
      content: string
      encoding: string
    } | null>,

  saveFile: (filePath: string, content: string) =>
    ipcRenderer.invoke('file:save', filePath, content) as Promise<{
      success: boolean
      error?: string
    }>,

  saveFileAs: (content: string) =>
    ipcRenderer.invoke('file:saveAs', content) as Promise<{
      path: string
      success: boolean
      error?: string
    } | null>,

  setTitle: (title: string) => ipcRenderer.send('window:setTitle', title),
  confirmClose: () => ipcRenderer.send('window:confirmClose'),

  onMenuNew: (cb: () => void) => {
    ipcRenderer.on('menu:new', cb)
    return () => ipcRenderer.removeListener('menu:new', cb)
  },
  onMenuOpen: (cb: () => void) => {
    ipcRenderer.on('menu:open', cb)
    return () => ipcRenderer.removeListener('menu:open', cb)
  },
  onMenuSave: (cb: () => void) => {
    ipcRenderer.on('menu:save', cb)
    return () => ipcRenderer.removeListener('menu:save', cb)
  },
  onMenuSaveAs: (cb: () => void) => {
    ipcRenderer.on('menu:saveAs', cb)
    return () => ipcRenderer.removeListener('menu:saveAs', cb)
  },
  onMenuSettings: (cb: () => void) => {
    ipcRenderer.on('menu:settings', cb)
    return () => ipcRenderer.removeListener('menu:settings', cb)
  },
  onMenuAutosaveRestore: (cb: () => void) => {
    ipcRenderer.on('menu:autosaveRestore', cb)
    return () => ipcRenderer.removeListener('menu:autosaveRestore', cb)
  },

  onBeforeClose: (cb: () => void) => {
    ipcRenderer.on('app:beforeClose', cb)
    return () => ipcRenderer.removeListener('app:beforeClose', cb)
  },

  onAppOpenFile: (cb: (filePath: string) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, path: string) => cb(path)
    ipcRenderer.on('app:openFile', handler)
    return () => ipcRenderer.removeListener('app:openFile', handler)
  },

  loadSession: () =>
    ipcRenderer.invoke('session:load') as Promise<{
      tabs: Array<{ filePath: string | null; cursorPos: number; dictName: string | null }>
      activeTabIndex: number
    } | null>,

  saveSession: (data: {
    tabs: Array<{ filePath: string | null; cursorPos: number; dictName: string | null }>
    activeTabIndex: number
  }) => ipcRenderer.invoke('session:save', data) as Promise<void>,

  // 設定
  settings: {
    load: () => ipcRenderer.invoke('settings:load') as Promise<import('../shared/settings-types').AppSettings>,
    save: (s: import('../shared/settings-types').AppSettings) =>
      ipcRenderer.invoke('settings:save', s) as Promise<void>
  },

  // 自動保存
  autosave: {
    save: (content: string, baseName: string) =>
      ipcRenderer.invoke('autosave:save', content, baseName) as Promise<void>,
    list: () =>
      ipcRenderer.invoke('autosave:list') as Promise<
        Array<{ path: string; name: string; mtime: number; preview: string }>
      >,
    open: (filePath: string) =>
      ipcRenderer.invoke('autosave:open', filePath) as Promise<string | null>
  },

  // Shell
  openDataDir: () => ipcRenderer.send('shell:openDataDir'),

  // 辞書 API
  dict: {
    listDicts: () => ipcRenderer.invoke('dict:listDicts') as Promise<string[]>,
    getActiveDict: () => ipcRenderer.invoke('dict:getActiveDict') as Promise<string | null>,
    setActiveDict: (name: string | null) => ipcRenderer.invoke('dict:setActiveDict', name),
    getCandidates: (textBeforeCursor: string) =>
      ipcRenderer.invoke('dict:getCandidates', textBeforeCursor) as Promise<{
        reading: string
        candidates: string[]
      } | null>,
    addEntry: (reading: string, candidates: string[]) =>
      ipcRenderer.invoke('dict:addEntry', reading, candidates) as Promise<boolean>,
    createDict: (name: string) =>
      ipcRenderer.invoke('dict:createDict', name) as Promise<boolean>,
    // 辞書管理ウィンドウ
    openManager: () => ipcRenderer.invoke('dict:openManager') as Promise<void>,
    getDictData: (name: string) =>
      ipcRenderer.invoke('dict:getDictData', name) as Promise<
        Record<string, Array<{ word: string; memo: string; count: number }>>
      >,
    updateEntry: (
      dictName: string, reading: string, index: number,
      patch: { word?: string; memo?: string; count?: number }
    ) => ipcRenderer.invoke('dict:updateEntry', dictName, reading, index, patch) as Promise<boolean>,
    removeCandidate: (dictName: string, reading: string, index: number) =>
      ipcRenderer.invoke('dict:removeCandidate', dictName, reading, index) as Promise<void>,
    addCandidate: (dictName: string, reading: string, word: string) =>
      ipcRenderer.invoke('dict:addCandidate', dictName, reading, word) as Promise<boolean>,
    renameReading: (dictName: string, oldReading: string, newReading: string) =>
      ipcRenderer.invoke('dict:renameReading', dictName, oldReading, newReading) as Promise<boolean>,
    removeReading: (dictName: string, reading: string) =>
      ipcRenderer.invoke('dict:removeReading', dictName, reading) as Promise<void>,
    renameDict: (oldName: string, newName: string) =>
      ipcRenderer.invoke('dict:renameDict', oldName, newName) as Promise<boolean>,
    deleteDict: (name: string) =>
      ipcRenderer.invoke('dict:deleteDict', name) as Promise<void>,
    copyDict: (src: string, dst: string) =>
      ipcRenderer.invoke('dict:copyDict', src, dst) as Promise<boolean>,
    exportTsv: (dictName: string) =>
      ipcRenderer.invoke('dict:exportTsv', dictName) as Promise<{ success: boolean; count: number }>,
    importTsv: (dictName: string) =>
      ipcRenderer.invoke('dict:importTsv', dictName) as Promise<{ success: boolean; count: number }>,
    recordUsage: (dictName: string, reading: string, word: string) =>
      ipcRenderer.invoke('dict:recordUsage', dictName, reading, word) as Promise<void>,
    notifyListUpdated: () => ipcRenderer.invoke('dict:notifyListUpdated') as Promise<void>,
    onListUpdated: (cb: () => void) => {
      ipcRenderer.on('dict:listUpdated', cb)
      return () => ipcRenderer.removeListener('dict:listUpdated', cb)
    }
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
}
