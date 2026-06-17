import { app, shell, BrowserWindow, ipcMain, dialog, Menu } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import * as chardet from 'chardet'
import * as iconv from 'iconv-lite'
import { DictManager } from '../shared/dict/DictManager'
import { searchCandidates } from '../shared/dict/engine'

let mainWindow: BrowserWindow | null = null
let dictManager: DictManager | null = null
let activeDictName: string | null = null

function readFileWithEncoding(filePath: string): { content: string; encoding: string } {
  const buf = readFileSync(filePath)
  const detected = chardet.detect(buf)
  const enc = detected && iconv.encodingExists(detected) ? detected : 'UTF-8'
  const content = iconv.decode(buf, enc)
  return { content, encoding: enc }
}

function buildMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'ファイル',
      submenu: [
        {
          label: '新規',
          accelerator: 'CmdOrCtrl+N',
          click: () => mainWindow?.webContents.send('menu:new')
        },
        {
          label: '開く...',
          accelerator: 'CmdOrCtrl+O',
          click: () => mainWindow?.webContents.send('menu:open')
        },
        {
          label: '保存',
          accelerator: 'CmdOrCtrl+S',
          click: () => mainWindow?.webContents.send('menu:save')
        },
        {
          label: '別名で保存...',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => mainWindow?.webContents.send('menu:saveAs')
        },
        { type: 'separator' },
        { label: '終了', role: 'quit' }
      ]
    },
    {
      label: '編集',
      submenu: [
        { label: '元に戻す', role: 'undo' },
        { label: 'やり直し', role: 'redo' },
        { type: 'separator' },
        { label: '切り取り', role: 'cut' },
        { label: 'コピー', role: 'copy' },
        { label: '貼り付け', role: 'paste' },
        { label: 'すべて選択', role: 'selectAll' }
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// IPC ハンドラー

ipcMain.handle('file:open', async () => {
  if (!mainWindow) return null
  const result = await dialog.showOpenDialog(mainWindow, {
    filters: [
      { name: 'テキストファイル', extensions: ['txt', 'md'] },
      { name: 'すべてのファイル', extensions: ['*'] }
    ],
    properties: ['openFile']
  })
  if (result.canceled || result.filePaths.length === 0) return null
  const filePath = result.filePaths[0]
  const { content, encoding } = readFileWithEncoding(filePath)
  return { path: filePath, content, encoding }
})

ipcMain.handle('file:save', async (_event, filePath: string, content: string) => {
  try {
    writeFileSync(filePath, content, 'utf-8')
    return { success: true }
  } catch (e) {
    return { success: false, error: String(e) }
  }
})

ipcMain.handle('file:saveAs', async (_event, content: string) => {
  if (!mainWindow) return null
  const result = await dialog.showSaveDialog(mainWindow, {
    filters: [
      { name: 'テキストファイル', extensions: ['txt'] },
      { name: 'すべてのファイル', extensions: ['*'] }
    ]
  })
  if (result.canceled || !result.filePath) return null
  try {
    writeFileSync(result.filePath, content, 'utf-8')
    return { path: result.filePath, success: true }
  } catch (e) {
    return { path: result.filePath, success: false, error: String(e) }
  }
})

ipcMain.on('window:setTitle', (_event, title: string) => {
  mainWindow?.setTitle(title)
})

// 辞書 IPC ハンドラー

ipcMain.handle('dict:listDicts', () => {
  return dictManager?.listDicts() ?? []
})

ipcMain.handle('dict:getActiveDict', () => activeDictName)

ipcMain.handle('dict:setActiveDict', (_event, name: string | null) => {
  activeDictName = name
})

ipcMain.handle('dict:getCandidates', (_event, textBeforeCursor: string) => {
  if (!dictManager || !activeDictName) return null
  const dict = dictManager.getDict(activeDictName)
  return searchCandidates(textBeforeCursor, dict)
})

ipcMain.handle('dict:addEntry', (_event, reading: string, candidates: string[]) => {
  if (!dictManager || !activeDictName) return false
  dictManager.addEntry(activeDictName, reading, candidates)
  return true
})

ipcMain.handle('dict:createDict', (_event, name: string) => {
  return dictManager?.createDict(name) ?? false
})

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.hex2bkap.kotobagae')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  const dictsDir = join(app.getPath('userData'), 'dicts')
  dictManager = new DictManager(dictsDir)

  buildMenu()
  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
