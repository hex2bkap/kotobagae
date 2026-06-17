import { app, shell, BrowserWindow, ipcMain, dialog, Menu, screen } from 'electron'
import { join, dirname } from 'path'
import {
  readFileSync, writeFileSync, renameSync, existsSync,
  mkdirSync, readdirSync, statSync, unlinkSync
} from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import * as chardet from 'chardet'
import * as iconv from 'iconv-lite'
import { DictManager } from '../shared/dict/DictManager'
import { searchCandidates } from '../shared/dict/engine'
import type { AppSettings, AutosaveFileInfo } from '../shared/settings-types'
import { DEFAULT_SETTINGS } from '../shared/settings-types'

// ── グローバル変数 ────────────────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null
let dictManager: DictManager | null = null
let activeDictName: string | null = null
let dataDir = ''
let currentSettings: AppSettings = { ...DEFAULT_SETTINGS, autosave: { ...DEFAULT_SETTINGS.autosave } }
let saveBoundsTimer: NodeJS.Timeout | null = null

// ── 型定義 ────────────────────────────────────────────────────────────────────

interface SessionTab {
  filePath: string | null
  cursorPos: number
  dictName: string | null
}
interface SessionData {
  tabs: SessionTab[]
  activeTabIndex: number
}

// ── データ保存先の解決（起動直後・IPC前に一度だけ実行）────────────────────

function resolveDataDir(): string {
  const exeDir = dirname(app.getPath('exe'))
  const portablePath = join(exeDir, 'portable.txt')
  return existsSync(portablePath) ? exeDir : app.getPath('userData')
}

// ── パスヘルパー ──────────────────────────────────────────────────────────────

function getSessionPath(): string { return join(dataDir, 'session.json') }
function getSettingsPath(): string { return join(dataDir, 'settings.json') }
function getAutosaveDir(): string { return join(dataDir, 'autosave') }

// ── 設定の読み書き ────────────────────────────────────────────────────────────

function loadSettings(): AppSettings {
  try {
    const raw = readFileSync(getSettingsPath(), 'utf-8')
    const p = JSON.parse(raw)
    // 未知キー無視・欠落キーはデフォルト補完
    return {
      windowBounds: p.windowBounds ?? DEFAULT_SETTINGS.windowBounds,
      autosave: {
        enabled: p.autosave?.enabled ?? DEFAULT_SETTINGS.autosave.enabled,
        intervalMinutes: p.autosave?.intervalMinutes ?? DEFAULT_SETTINGS.autosave.intervalMinutes,
        maxAgeDays: p.autosave?.maxAgeDays ?? DEFAULT_SETTINGS.autosave.maxAgeDays
      }
    }
  } catch {
    return { ...DEFAULT_SETTINGS, autosave: { ...DEFAULT_SETTINGS.autosave } }
  }
}

function saveSettings(s: AppSettings): void {
  const path = getSettingsPath()
  const tmp = path + '.tmp'
  writeFileSync(tmp, JSON.stringify(s, null, 2), 'utf-8')
  renameSync(tmp, path)
}

// ── ウィンドウ位置クランプ（別解像度・別PCで画面外に出ない）─────────────

function clampBounds(
  b: NonNullable<AppSettings['windowBounds']>
): NonNullable<AppSettings['windowBounds']> {
  const displays = screen.getAllDisplays()
  let minX = Infinity, minY = Infinity, maxRight = -Infinity, maxBottom = -Infinity
  for (const d of displays) {
    const wa = d.workArea
    minX = Math.min(minX, wa.x)
    minY = Math.min(minY, wa.y)
    maxRight = Math.max(maxRight, wa.x + wa.width)
    maxBottom = Math.max(maxBottom, wa.y + wa.height)
  }
  const w = Math.max(600, Math.min(b.width, maxRight - minX))
  const h = Math.max(400, Math.min(b.height, maxBottom - minY))
  const x = Math.max(minX, Math.min(b.x, maxRight - w))
  const y = Math.max(minY, Math.min(b.y, maxBottom - h))
  return { x, y, width: w, height: h }
}

// ── 自動保存の古いファイル削除 ─────────────────────────────────────────────

function cleanOldAutosaves(maxAgeDays: number): void {
  if (maxAgeDays === 0) return
  const autosaveDir = getAutosaveDir()
  if (!existsSync(autosaveDir)) return
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000
  for (const fname of readdirSync(autosaveDir)) {
    if (!fname.endsWith('.txt')) continue
    try {
      if (statSync(join(autosaveDir, fname)).mtimeMs < cutoff) {
        unlinkSync(join(autosaveDir, fname))
      }
    } catch { /* 無視 */ }
  }
}

// ── ファイル読み込み ──────────────────────────────────────────────────────────

function readFileWithEncoding(filePath: string): { content: string; encoding: string } {
  const buf = readFileSync(filePath)
  const detected = chardet.detect(buf)
  const enc = detected && iconv.encodingExists(detected) ? detected : 'UTF-8'
  return { content: iconv.decode(buf, enc), encoding: enc }
}

// ── メニュー ──────────────────────────────────────────────────────────────────

function buildMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'ファイル',
      submenu: [
        { label: '新規', accelerator: 'CmdOrCtrl+N', click: () => mainWindow?.webContents.send('menu:new') },
        { label: '開く...', accelerator: 'CmdOrCtrl+O', click: () => mainWindow?.webContents.send('menu:open') },
        { label: '保存', accelerator: 'CmdOrCtrl+S', click: () => mainWindow?.webContents.send('menu:save') },
        { label: '別名で保存...', accelerator: 'CmdOrCtrl+Shift+S', click: () => mainWindow?.webContents.send('menu:saveAs') },
        { type: 'separator' },
        { label: '自動保存から復元...', click: () => mainWindow?.webContents.send('menu:autosaveRestore') },
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
    },
    {
      label: '設定',
      submenu: [
        {
          label: '設定...',
          accelerator: 'CmdOrCtrl+,',
          click: () => mainWindow?.webContents.send('menu:settings')
        },
        {
          label: 'データフォルダを開く',
          click: () => shell.openPath(dataDir)
        }
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// ── ウィンドウ作成 ────────────────────────────────────────────────────────────

function createWindow(): void {
  const bounds = currentSettings.windowBounds
    ? clampBounds(currentSettings.windowBounds)
    : null

  mainWindow = new BrowserWindow({
    width: bounds?.width ?? 900,
    height: bounds?.height ?? 670,
    x: bounds?.x,
    y: bounds?.y,
    show: false,
    autoHideMenuBar: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => { mainWindow!.show() })

  // ウィンドウ位置・サイズを 500ms デバウンスで設定ファイルに保存
  const scheduleSaveBounds = (): void => {
    if (saveBoundsTimer) clearTimeout(saveBoundsTimer)
    saveBoundsTimer = setTimeout(() => {
      if (!mainWindow) return
      currentSettings = { ...currentSettings, windowBounds: mainWindow.getBounds() }
      saveSettings(currentSettings)
    }, 500)
  }
  mainWindow.on('move', scheduleSaveBounds)
  mainWindow.on('resize', scheduleSaveBounds)

  mainWindow.on('close', (e) => {
    e.preventDefault()
    mainWindow?.webContents.send('app:beforeClose')
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

// ── IPC ハンドラー ─────────────────────────────────────────────────────────────

// ファイル

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

ipcMain.handle('file:openPath', (_event, filePath: string) => {
  try {
    const { content, encoding } = readFileWithEncoding(filePath)
    return { path: filePath, content, encoding }
  } catch {
    return null
  }
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

ipcMain.on('window:setTitle', (_event, title: string) => { mainWindow?.setTitle(title) })
ipcMain.on('window:confirmClose', () => { mainWindow?.destroy() })

// セッション

ipcMain.handle('session:load', () => {
  try {
    return JSON.parse(readFileSync(getSessionPath(), 'utf-8')) as SessionData
  } catch {
    return null
  }
})

ipcMain.handle('session:save', (_event, data: SessionData) => {
  try {
    const path = getSessionPath()
    const tmp = path + '.tmp'
    writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8')
    renameSync(tmp, path)
  } catch (e) {
    console.error('session:save failed', e)
  }
})

// 設定

ipcMain.handle('settings:load', () => currentSettings)

ipcMain.handle('settings:save', (_event, s: AppSettings) => {
  currentSettings = s
  saveSettings(s)
})

// 自動保存

ipcMain.handle('autosave:save', (_event, content: string, baseName: string) => {
  if (!content.trim()) return
  const autosaveDir = getAutosaveDir()
  mkdirSync(autosaveDir, { recursive: true })
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const safe = baseName.replace(/[<>:"/\\|?*]/g, '_')
  writeFileSync(join(autosaveDir, `${safe}_${ts}.txt`), content, 'utf-8')
  cleanOldAutosaves(currentSettings.autosave.maxAgeDays)
})

ipcMain.handle('autosave:list', (): AutosaveFileInfo[] => {
  const autosaveDir = getAutosaveDir()
  if (!existsSync(autosaveDir)) return []
  return readdirSync(autosaveDir)
    .filter((f) => f.endsWith('.txt'))
    .flatMap((fname) => {
      try {
        const fpath = join(autosaveDir, fname)
        const mtime = statSync(fpath).mtimeMs
        const preview = readFileSync(fpath, 'utf-8').slice(0, 120)
        return [{ path: fpath, name: fname, mtime, preview }]
      } catch {
        return []
      }
    })
    .sort((a, b) => b.mtime - a.mtime)
})

ipcMain.handle('autosave:open', (_event, filePath: string): string | null => {
  try {
    return readFileSync(filePath, 'utf-8')
  } catch {
    return null
  }
})

// Shell

ipcMain.on('shell:openDataDir', () => { shell.openPath(dataDir) })

// 辞書

ipcMain.handle('dict:listDicts', () => dictManager?.listDicts() ?? [])
ipcMain.handle('dict:getActiveDict', () => activeDictName)
ipcMain.handle('dict:setActiveDict', (_event, name: string | null) => { activeDictName = name })
ipcMain.handle('dict:getCandidates', (_event, textBeforeCursor: string) => {
  if (!dictManager || !activeDictName) return null
  return searchCandidates(textBeforeCursor, dictManager.getDict(activeDictName))
})
ipcMain.handle('dict:addEntry', (_event, reading: string, candidates: string[]) => {
  if (!dictManager || !activeDictName) return false
  dictManager.addEntry(activeDictName, reading, candidates)
  return true
})
ipcMain.handle('dict:createDict', (_event, name: string) => dictManager?.createDict(name) ?? false)

// ── シングルインスタンス制御 ────────────────────────────────────────────────

const gotLock = app.requestSingleInstanceLock()

if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    const filePath = argv.slice(2).find((arg) => !arg.startsWith('-'))
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
      if (filePath) mainWindow.webContents.send('app:openFile', filePath)
    }
  })

  app.whenReady().then(() => {
    // ① resolveDataDir（IPC前・最初に実行。session・dicts・settings の3つが必ずここを通る）
    dataDir = resolveDataDir()

    // ② 設定読み込み（dataDir 確定後）
    currentSettings = loadSettings()

    electronApp.setAppUserModelId('com.hex2bkap.kotobagae')
    app.on('browser-window-created', (_, window) => { optimizer.watchWindowShortcuts(window) })

    // ③ DictManager 初期化（dataDir 経由）
    dictManager = new DictManager(join(dataDir, 'dicts'))

    buildMenu()
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
