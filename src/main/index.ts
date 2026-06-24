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
import { searchMultiDicts } from '../shared/dict/engine'
import type { AppSettings, AutosaveFileInfo } from '../shared/settings-types'
import { DEFAULT_SETTINGS } from '../shared/settings-types'

// ── グローバル変数 ────────────────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null
let dictWindow: BrowserWindow | null = null
let dictManager: DictManager | null = null
let activeDictNames: string[] = []
let dataDir = ''
let currentSettings: AppSettings = { ...DEFAULT_SETTINGS, autosave: { ...DEFAULT_SETTINGS.autosave } }
let saveBoundsTimer: NodeJS.Timeout | null = null

// ── 型定義 ────────────────────────────────────────────────────────────────────

interface SessionTab {
  filePath: string | null
  cursorPos: number
  dictNames: string[]
  // M7移行: 旧セッションの dictName: string|null も読めるようにする
  dictName?: string | null
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
      dictWindowBounds: p.dictWindowBounds ?? DEFAULT_SETTINGS.dictWindowBounds,
      autosave: {
        enabled: p.autosave?.enabled ?? DEFAULT_SETTINGS.autosave.enabled,
        intervalMinutes: p.autosave?.intervalMinutes ?? DEFAULT_SETTINGS.autosave.intervalMinutes,
        maxAgeDays: p.autosave?.maxAgeDays ?? DEFAULT_SETTINGS.autosave.maxAgeDays
      },
      dictSort: {
        byFrequency: p.dictSort?.byFrequency ?? DEFAULT_SETTINGS.dictSort.byFrequency,
        showCount: p.dictSort?.showCount ?? DEFAULT_SETTINGS.dictSort.showCount,
        maxCandidates: p.dictSort?.maxCandidates ?? DEFAULT_SETTINGS.dictSort.maxCandidates
      },
      display: {
        theme: p.display?.theme ?? DEFAULT_SETTINGS.display.theme,
        showWritingStats: p.display?.showWritingStats ?? DEFAULT_SETTINGS.display.showWritingStats,
        wordGoal: p.display?.wordGoal ?? DEFAULT_SETTINGS.display.wordGoal,
        fontSize: p.display?.fontSize ?? DEFAULT_SETTINGS.display.fontSize,
        fontFamily: p.display?.fontFamily ?? DEFAULT_SETTINGS.display.fontFamily,
        textColorLight: p.display?.textColorLight ?? DEFAULT_SETTINGS.display.textColorLight,
        textColorDark: p.display?.textColorDark ?? DEFAULT_SETTINGS.display.textColorDark,
        boldText: p.display?.boldText ?? DEFAULT_SETTINGS.display.boldText,
        wordWrap: p.display?.wordWrap ?? DEFAULT_SETTINGS.display.wordWrap
      },
      dictPriorityOrder: Array.isArray(p.dictPriorityOrder) ? p.dictPriorityOrder : [],
      defaultDictNames: Array.isArray(p.defaultDictNames) ? p.defaultDictNames : []
    }
  } catch {
    return { ...DEFAULT_SETTINGS, autosave: { ...DEFAULT_SETTINGS.autosave }, display: { ...DEFAULT_SETTINGS.display } }
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
  if (maxAgeDays <= 0) return  // -1=無期限・0=旧互換（削除しない）
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

// ── 辞書管理ウィンドウ ────────────────────────────────────────────────────────

function createOrFocusDictWindow(): void {
  if (dictWindow && !dictWindow.isDestroyed()) {
    if (dictWindow.isMinimized()) dictWindow.restore()
    dictWindow.focus()
    return
  }

  const savedBounds = currentSettings.dictWindowBounds
  const bounds = savedBounds ? clampBounds(savedBounds) : null

  dictWindow = new BrowserWindow({
    width: bounds?.width ?? 820,
    height: bounds?.height ?? 580,
    x: bounds?.x,
    y: bounds?.y,
    title: '辞書を管理 — コトバガエ',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  dictWindow.on('ready-to-show', () => {
    dictWindow?.show()
    if (is.dev) dictWindow?.webContents.openDevTools()
  })

  let dictBoundsTimer: NodeJS.Timeout | null = null
  const scheduleDict = (): void => {
    if (dictBoundsTimer) clearTimeout(dictBoundsTimer)
    dictBoundsTimer = setTimeout(() => {
      if (!dictWindow || dictWindow.isDestroyed()) return
      currentSettings = { ...currentSettings, dictWindowBounds: dictWindow.getBounds() }
      saveSettings(currentSettings)
    }, 500)
  }
  dictWindow.on('move', scheduleDict)
  dictWindow.on('resize', scheduleDict)
  dictWindow.on('focus', () => buildDictMenu())

  dictWindow.on('closed', () => { dictWindow = null })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    dictWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] + '/dict.html')
  } else {
    dictWindow.loadFile(join(__dirname, '../renderer/dict.html'))
  }
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
      label: '表示',
      submenu: [
        {
          label: 'フォントサイズを大きく',
          accelerator: 'CmdOrCtrl+Plus',
          click: () => mainWindow?.webContents.send('menu:display', { action: 'fontSizeUp' })
        },
        {
          label: 'フォントサイズを小さく',
          accelerator: 'CmdOrCtrl+-',
          click: () => mainWindow?.webContents.send('menu:display', { action: 'fontSizeDown' })
        },
        { type: 'separator' },
        {
          label: '本文を太字で表示',
          type: 'checkbox',
          checked: currentSettings.display.boldText,
          click: (item) => mainWindow?.webContents.send('menu:display', { action: 'boldText', value: item.checked })
        },
        {
          label: '折り返し',
          type: 'checkbox',
          checked: currentSettings.display.wordWrap,
          click: (item) => mainWindow?.webContents.send('menu:display', { action: 'wordWrap', value: item.checked })
        },
        { type: 'separator' },
        {
          label: 'テーマ',
          submenu: [
            { label: '和紙（Washi）', type: 'radio', checked: currentSettings.display.theme === 'washi', click: () => mainWindow?.webContents.send('menu:display', { action: 'theme', value: 'washi' }) },
            { label: 'ダーク（Dark）', type: 'radio', checked: currentSettings.display.theme === 'dark', click: () => mainWindow?.webContents.send('menu:display', { action: 'theme', value: 'dark' }) },
            { label: 'ライト（Light）', type: 'radio', checked: currentSettings.display.theme === 'light', click: () => mainWindow?.webContents.send('menu:display', { action: 'theme', value: 'light' }) },
            { label: '墨夜（Sumi）', type: 'radio', checked: currentSettings.display.theme === 'sumi', click: () => mainWindow?.webContents.send('menu:display', { action: 'theme', value: 'sumi' }) }
          ]
        }
      ]
    },
    {
      label: 'ツール',
      submenu: [
        { label: '辞書を管理…', click: () => createOrFocusDictWindow() },
        { type: 'separator' },
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
    },
    {
      label: 'ヘルプ',
      submenu: [
        {
          label: 'このアプリについて',
          click: () => {
            dialog.showMessageBox(mainWindow!, {
              type: 'info',
              title: 'コトバガエについて',
              message: 'コトバガエ',
              detail: '作品ごとに辞書を切り替えられる、日本語創作執筆向けテキストエディタ。\n\nバージョン: 1.0.0'
            })
          }
        },
        { label: 'ショートカット一覧', click: () => mainWindow?.webContents.send('menu:showShortcuts') }
      ]
    }
  ]
  const menu = Menu.buildFromTemplate(template)
  if (process.platform === 'win32') {
    mainWindow?.setMenu(menu)
  } else {
    Menu.setApplicationMenu(menu)
  }
}

function buildDictMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: '辞書',
      submenu: [
        { label: '閉じる', click: () => dictWindow?.close() }
      ]
    }
  ]
  const menu = Menu.buildFromTemplate(template)
  if (process.platform === 'win32') {
    dictWindow?.setMenu(menu)
  } else {
    Menu.setApplicationMenu(menu)
  }
}

// ── ウィンドウ作成 ────────────────────────────────────────────────────────────

function createWindow(): void {
  const bounds = currentSettings.windowBounds
    ? clampBounds(currentSettings.windowBounds)
    : null

  const isLightTheme = currentSettings.display.theme === 'light' || currentSettings.display.theme === 'washi'
  mainWindow = new BrowserWindow({
    width: bounds?.width ?? 900,
    height: bounds?.height ?? 670,
    x: bounds?.x,
    y: bounds?.y,
    show: false,
    autoHideMenuBar: false,
    backgroundColor: isLightTheme ? '#F5F0E6' : '#1C1814',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
    if (is.dev) mainWindow!.webContents.openDevTools()
  })

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
  mainWindow.on('focus', () => buildMenu())

  mainWindow.on('close', (e) => {
    e.preventDefault()
    dictManager?.flushDirty()
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
  const tmp = filePath + '.tmp'
  try {
    writeFileSync(tmp, content, 'utf-8')
    renameSync(tmp, filePath)
    return { success: true }
  } catch (e) {
    try { unlinkSync(tmp) } catch { /* 無視 */ }
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
  const tmp = result.filePath + '.tmp'
  try {
    writeFileSync(tmp, content, 'utf-8')
    renameSync(tmp, result.filePath)
    return { path: result.filePath, success: true }
  } catch (e) {
    try { unlinkSync(tmp) } catch { /* 無視 */ }
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
  // windowBounds はメインが move/resize で管理する状態。モーダルの値で上書きしない
  currentSettings = { ...s, windowBounds: currentSettings.windowBounds }
  saveSettings(currentSettings)
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
    .slice(0, 10)   // 直近10件のみ
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
ipcMain.handle('dict:getActiveDicts', () => activeDictNames)
ipcMain.handle('dict:setActiveDicts', (_event, names: string[]) => { activeDictNames = names })
ipcMain.handle('dict:getCandidates', (_event, textBeforeCursor: string) => {
  if (!dictManager || activeDictNames.length === 0) return null
  // グローバル優先度順で辞書を並べる
  const priorityOrder = currentSettings.dictPriorityOrder
  const ordered = activeDictNames.slice().sort((a, b) => {
    const ia = priorityOrder.indexOf(a)
    const ib = priorityOrder.indexOf(b)
    const ra = ia === -1 ? Infinity : ia
    const rb = ib === -1 ? Infinity : ib
    return ra - rb
  })
  const dicts = ordered.map((name) => ({ name, dict: dictManager!.getDict(name) }))
  const byFrequency = currentSettings.dictSort?.byFrequency ?? true
  const maxCandidates = currentSettings.dictSort?.maxCandidates ?? 10
  return searchMultiDicts(textBeforeCursor, dicts, maxCandidates, byFrequency)
})
ipcMain.handle('dict:addEntry', (_event, dictName: string, reading: string, candidates: string[]) => {
  if (!dictManager || !dictName) return false
  dictManager.addEntry(dictName, reading, candidates)
  return true
})
ipcMain.handle('dict:createDict', (_event, name: string) => dictManager?.createDict(name) ?? false)
ipcMain.handle('dict:recordUsage', (_event, dictName: string, reading: string, word: string) => {
  dictManager?.recordUsage(dictName, reading, word)
})
ipcMain.handle('dict:getPriorityOrder', () => currentSettings.dictPriorityOrder)
ipcMain.handle('dict:setPriorityOrder', (_event, order: string[]) => {
  currentSettings = { ...currentSettings, dictPriorityOrder: order }
  saveSettings(currentSettings)
})

// 辞書管理ウィンドウ操作
ipcMain.handle('dict:openManager', () => createOrFocusDictWindow())
ipcMain.handle('dict:getDictData', (_event, name: string) => dictManager?.getDictData(name) ?? {})
ipcMain.handle('dict:updateEntry', (
  _event, dictName: string, reading: string, index: number,
  patch: { word?: string; memo?: string; count?: number }
) => dictManager?.updateEntry(dictName, reading, index, patch) ?? false)
ipcMain.handle('dict:removeCandidate', (
  _event, dictName: string, reading: string, index: number
) => { dictManager?.removeCandidate(dictName, reading, index) })
ipcMain.handle('dict:addCandidate', (
  _event, dictName: string, reading: string, word: string
) => dictManager?.addCandidate(dictName, reading, word) ?? false)
ipcMain.handle('dict:renameReading', (
  _event, dictName: string, oldR: string, newR: string
) => dictManager?.renameReading(dictName, oldR, newR) ?? false)
ipcMain.handle('dict:removeReading', (
  _event, dictName: string, reading: string
) => { dictManager?.removeReading(dictName, reading) })
ipcMain.handle('dict:renameDict', (
  _event, oldName: string, newName: string
) => dictManager?.renameDict(oldName, newName) ?? false)
ipcMain.handle('dict:deleteDict', (
  _event, name: string
) => { dictManager?.deleteDict(name) })
ipcMain.handle('dict:copyDict', (
  _event, src: string, dst: string
) => dictManager?.copyDict(src, dst) ?? false)
ipcMain.handle('dict:exportTsv', async (event, dictName: string) => {
  const win = BrowserWindow.fromWebContents(event.sender) ?? mainWindow
  if (!win || !dictManager) return { success: false, count: 0 }
  const result = await dialog.showSaveDialog(win, {
    defaultPath: `${dictName}.tsv`,
    filters: [{ name: 'TSVファイル', extensions: ['tsv', 'txt'] }]
  })
  if (result.canceled || !result.filePath) return { success: false, count: 0 }
  const count = dictManager.exportTsv(result.filePath, dictName)
  return { success: true, count }
})
ipcMain.handle('dict:importTsv', async (event, dictName: string) => {
  const win = BrowserWindow.fromWebContents(event.sender) ?? mainWindow
  if (!win || !dictManager) return { success: false, count: 0 }
  const result = await dialog.showOpenDialog(win, {
    filters: [{ name: 'TSVファイル', extensions: ['tsv', 'txt'] }],
    properties: ['openFile']
  })
  if (result.canceled || result.filePaths.length === 0) return { success: false, count: 0 }
  const count = dictManager.importTsv(result.filePaths[0], dictName)
  // メインウィンドウの辞書リストを更新通知
  mainWindow?.webContents.send('dict:listUpdated')
  return { success: true, count }
})
// 辞書リスト変更をメインウィンドウへ通知するヘルパー（管理操作後に呼ぶ）
ipcMain.handle('dict:notifyListUpdated', () => {
  mainWindow?.webContents.send('dict:listUpdated')
})

// 右クリックコンテキストメニュー
ipcMain.on('contextmenu:show', (_event, hasSelection: boolean) => {
  const menu = Menu.buildFromTemplate([
    { label: '切り取り', role: 'cut' },
    { label: 'コピー', role: 'copy' },
    { label: '貼り付け', role: 'paste' },
    { label: 'すべて選択', role: 'selectAll' },
    { type: 'separator' },
    {
      label: '辞書に登録',
      enabled: hasSelection,
      click: () => mainWindow?.webContents.send('contextmenu:dictRegister')
    }
  ])
  menu.popup({ window: mainWindow ?? undefined })
})

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

    // ④ 使用頻度カウントの定期バッチ保存（5分ごと）
    setInterval(() => { dictManager?.flushDirty() }, 5 * 60 * 1000)

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
