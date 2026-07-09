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
  syncFocusMode: (value: boolean) => ipcRenderer.send('focusMode:sync', value),

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
  onMenuCloseTab: (cb: () => void) => {
    ipcRenderer.on('menu:closeTab', cb)
    return () => ipcRenderer.removeListener('menu:closeTab', cb)
  },
  onMenuSettings: (cb: () => void) => {
    ipcRenderer.on('menu:settings', cb)
    return () => ipcRenderer.removeListener('menu:settings', cb)
  },
  onMenuAutosaveRestore: (cb: () => void) => {
    ipcRenderer.on('menu:autosaveRestore', cb)
    return () => ipcRenderer.removeListener('menu:autosaveRestore', cb)
  },

  onMenuShortcuts: (cb: () => void) => {
    ipcRenderer.on('menu:showShortcuts', cb)
    return () => ipcRenderer.removeListener('menu:showShortcuts', cb)
  },

  onMenuAbout: (cb: () => void) => {
    ipcRenderer.on('menu:about', cb)
    return () => ipcRenderer.removeListener('menu:about', cb)
  },

  onMenuDisplay: (cb: (action: string, value?: unknown) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, payload: { action: string; value?: unknown }) =>
      cb(payload.action, payload.value)
    ipcRenderer.on('menu:display', handler)
    return () => ipcRenderer.removeListener('menu:display', handler)
  },

  onMenuToggleFocusMode: (cb: () => void) => {
    ipcRenderer.on('menu:toggleFocusMode', cb)
    return () => ipcRenderer.removeListener('menu:toggleFocusMode', cb)
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

  getVersion: () => ipcRenderer.invoke('app:getVersion') as Promise<string>,

  loadSession: () =>
    ipcRenderer.invoke('session:load') as Promise<{
      tabs: Array<{ filePath: string | null; cursorPos: number; dictNames: string[]; dictName?: string | null }>
      activeTabIndex: number
    } | null>,

  saveSession: (data: {
    tabs: Array<{ filePath: string | null; cursorPos: number; dictNames: string[] }>
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
  openAutosaveDir: () => ipcRenderer.send('shell:openAutosaveDir'),

  // 辞書 API
  dict: {
    listDicts: () => ipcRenderer.invoke('dict:listDicts') as Promise<string[]>,
    getActiveDicts: () => ipcRenderer.invoke('dict:getActiveDicts') as Promise<string[]>,
    setActiveDicts: (names: string[]) => ipcRenderer.invoke('dict:setActiveDicts', names),
    getCandidates: (textBeforeCursor: string) =>
      ipcRenderer.invoke('dict:getCandidates', textBeforeCursor) as Promise<{
        reading: string
        candidates: Array<{ word: string; dictName: string }>
      } | null>,
    addEntry: (dictName: string, reading: string, candidates: string[]) =>
      ipcRenderer.invoke('dict:addEntry', dictName, reading, candidates) as Promise<boolean>,
    getPriorityOrder: () => ipcRenderer.invoke('dict:getPriorityOrder') as Promise<string[]>,
    setPriorityOrder: (order: string[]) => ipcRenderer.invoke('dict:setPriorityOrder', order),
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
    },
    onFlushBeforeClose: (cb: () => void) => {
      ipcRenderer.on('dict:flush-before-close', cb)
      return () => ipcRenderer.removeListener('dict:flush-before-close', cb)
    },
    flushDone: () => ipcRenderer.send('dict:flush-done')
  },

  contextMenu: {
    show: (hasSelection: boolean) => ipcRenderer.send('contextmenu:show', hasSelection),
    onDictRegister: (cb: () => void) => {
      ipcRenderer.on('contextmenu:dictRegister', cb)
      return () => ipcRenderer.removeListener('contextmenu:dictRegister', cb)
    }
  },

  platform: process.platform
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
