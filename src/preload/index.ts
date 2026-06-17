import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  openFile: () =>
    ipcRenderer.invoke('file:open') as Promise<{
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
