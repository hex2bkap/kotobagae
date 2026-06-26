import React, { useEffect, useRef, useCallback, useState } from 'react'
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view'
import { EditorState, Extension, Prec, Compartment } from '@codemirror/state'
import { defaultKeymap, historyKeymap, history, indentWithTab } from '@codemirror/commands'
import { search } from '@codemirror/search'
import { CandidatePopup } from './components/CandidatePopup'
import { InputModal } from './components/InputModal'
import { ConfirmModal } from './components/ConfirmModal'
import { SettingsModal } from './components/SettingsModal'
import { AutosaveRestoreModal } from './components/AutosaveRestoreModal'
import { SearchPanel } from './components/SearchPanel'
import { StatusBar, type StatusInfo } from './components/StatusBar'
import { RegisterModal } from './components/RegisterModal'
import { MultiUnsavedModal, type UnsavedTabInfo, type MultiUnsavedResult } from './components/MultiUnsavedModal'
import { ShortcutModal } from './components/ShortcutModal'
import { AboutModal } from './components/AboutModal'
import { TbIcon, ICONS } from './components/TbIcon'
import { basename } from './utils/path'
import type { AppSettings } from '../../shared/settings-types'
import { DEFAULT_SETTINGS } from '../../shared/settings-types'

const APP_NAME = 'コトバガエ'
const MAX_SEARCH_LEN = 10
const MAX_ACTIVE_DICTS = 5

interface Tab {
  id: string
  filePath: string | null
  editorState: EditorState
  dirty: boolean
  missing: boolean
  dictNames: string[]  // per-tab 有効辞書（グローバル優先度順）
}

interface CandidateWithSource {
  word: string
  dictName: string
}

interface PopupState {
  candidates: CandidateWithSource[]
  reading: string
  selectedIndex: number
  position: { top: number; left: number }
}

let _tabIdCounter = 0
function newTabId(): string {
  return `t${++_tabIdCounter}`
}

// 辞書名リストをグローバル優先度順にソートする（優先度未登録は末尾に）
function sortByPriority(names: string[], order: string[]): string[] {
  return names.slice().sort((a, b) => {
    const ia = order.indexOf(a)
    const ib = order.indexOf(b)
    const ra = ia === -1 ? Infinity : ia
    const rb = ib === -1 ? Infinity : ib
    return ra - rb
  })
}

// ── 辞書セレクタ（複数選択チェックボックスドロップダウン） ─────────────────

function DictSelector({
  dictList,
  priorityOrder,
  activeDictNames,
  onToggle,
  onOpenManager
}: {
  dictList: string[]
  priorityOrder: string[]
  activeDictNames: string[]
  onToggle: (name: string, checked: boolean) => void
  onOpenManager: () => void
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // 外クリックで閉じる
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // ラベル表示：「辞書名 +N」or「（なし）」
  const label = activeDictNames.length === 0
    ? '（なし）'
    : activeDictNames.length === 1
    ? activeDictNames[0]
    : `${activeDictNames[0]} +${activeDictNames.length - 1}`

  // 全辞書を優先度順で並べて表示
  const orderedAll = sortByPriority(dictList, priorityOrder)

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        title={activeDictNames.length > 0 ? activeDictNames.join(', ') : '辞書なし'}
        style={{
          fontSize: '13px', padding: '2px 8px',
          background: 'var(--kg-bg-primary)', color: 'var(--kg-text-primary)',
          border: '1px solid var(--kg-border-strong)', borderRadius: 3, cursor: 'pointer',
          maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
        }}
      >
        {label} ▾
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 2px)', left: 0, zIndex: 1000,
          background: 'var(--kg-bg-primary)', border: '1px solid var(--kg-border-strong)',
          borderRadius: 4, boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          minWidth: 180, maxWidth: 280
        }}>
          {orderedAll.length === 0 && (
            <div style={{ padding: '6px 10px', fontSize: 12, color: 'var(--kg-text-muted)' }}>辞書がありません</div>
          )}
          {orderedAll.map((name, i) => {
            const isActive = activeDictNames.includes(name)
            const isPrimary = activeDictNames[0] === name
            const disabled = !isActive && activeDictNames.length >= MAX_ACTIVE_DICTS
            return (
              <label
                key={name}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '5px 10px', cursor: disabled ? 'not-allowed' : 'pointer',
                  fontSize: 13, opacity: disabled ? 0.5 : 1,
                  borderBottom: i < orderedAll.length - 1 ? '1px solid var(--kg-border)' : undefined
                }}
              >
                <input
                  type="checkbox"
                  checked={isActive}
                  disabled={disabled}
                  onChange={(e) => onToggle(name, e.target.checked)}
                  style={{ margin: 0 }}
                />
                {isPrimary && (
                  <span title="この辞書に登録されます" style={{ fontSize: 9, color: 'var(--kg-accent)', fontWeight: 'bold' }}>●</span>
                )}
                <span title={name} style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
              </label>
            )
          })}
          <div style={{ borderTop: '1px solid var(--kg-border-strong)', padding: '4px 8px' }}>
            <button
              onClick={() => { setOpen(false); onOpenManager() }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 12, color: 'var(--kg-text-secondary)', padding: '2px 0'
              }}
            >辞書を管理…</button>
          </div>
        </div>
      )}
    </div>
  )
}

// CodeMirror の動的再構成用 Compartment（グローバル。App と同ライフタイム）
const fontCompartment = new Compartment()
const wrapCompartment = new Compartment()

function buildFontTheme(s: AppSettings | null): Extension {
  const disp = s?.display
  const size = `${disp?.fontSize ?? 16}px`
  const family = disp?.fontFamily
    ? `"${disp.fontFamily}", "Yu Gothic UI", "Meiryo", "Noto Sans JP", sans-serif`
    : '"Yu Gothic UI", "Meiryo", "Noto Sans JP", sans-serif'
  const weight = disp?.boldText ? 'bold' : 'normal'
  return EditorView.theme({
    '&': { height: '100%', fontSize: size },
    '.cm-scroller': { overflow: 'auto', fontFamily: family, lineHeight: '1.8' },
    '.cm-content': {
      padding: '12px 16px', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
      caretColor: 'var(--kg-caret)', fontWeight: weight
    },
    '.cm-gutters': { background: 'var(--kg-gutter-bg)', borderRight: '1px solid var(--kg-border)' },
    '.cm-activeLineGutter': { background: 'var(--kg-active-gutter)' },
    '.cm-activeLine': { background: 'var(--kg-active-line)' }
  })
}


function App(): JSX.Element {
  const editorRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const extensionsRef = useRef<Extension[] | null>(null)
  const isComposingRef = useRef(false)

  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [dictList, setDictList] = useState<string[]>([])
  const [priorityOrder, setPriorityOrder] = useState<string[]>([])
  const [popup, setPopup] = useState<PopupState | null>(null)
  const [modal, setModal] = useState<{
    message: string
    defaultValue?: string
    onOk: (v: string) => void
  } | null>(null)
  const [confirm, setConfirm] = useState<{
    message: string
    onOk: () => void
    onCancel: () => void
  } | null>(null)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [showAutosaveRestore, setShowAutosaveRestore] = useState(false)
  const [registerState, setRegisterState] = useState<{
    selectedText: string
    activeDictNames: string[]
  } | null>(null)

  // 検索パネル
  const [showSearch, setShowSearch] = useState(false)
  const [showReplace, setShowReplace] = useState(false)

  // 集中モード（F11）
  const [focusMode, setFocusMode] = useState(false)

  // 保存ボタンのフラッシュ
  const [saveFlash, setSaveFlash] = useState(false)
  const saveFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ショートカット一覧モーダル
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [showAbout, setShowAbout] = useState(false)

  // ステータスバーの一時メッセージ
  const [statusMsg, setStatusMsg] = useState<string | null>(null)
  const statusMsgTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 複数未保存ファイルモーダル（Promise-based）
  const [multiUnsaved, setMultiUnsaved] = useState<{
    tabs: UnsavedTabInfo[]
    autosaveEnabled: boolean
    onResult: (r: MultiUnsavedResult) => void
  } | null>(null)

  // ステータスバー
  const [statusInfo, setStatusInfo] = useState<StatusInfo>({
    line: 1, col: 1, charCount: 0, selText: null, sessionDelta: 0
  })
  const sessionStartCharsRef = useRef<number | null>(null)

  // callbacks / state への参照を extensions や非同期コールバックから安全に使うための ref 群
  const tabsRef = useRef<Tab[]>(tabs)
  const activeTabIdRef = useRef<string | null>(activeTabId)
  const popupRef = useRef<PopupState | null>(popup)
  tabsRef.current = tabs
  activeTabIdRef.current = activeTabId
  popupRef.current = popup

  const activeTab = tabs.find((t) => t.id === activeTabId)
  const activeDictNames = activeTab?.dictNames ?? []
  const activeDictNamesRef = useRef<string[]>(activeDictNames)
  activeDictNamesRef.current = activeDictNames

  const priorityOrderRef = useRef<string[]>(priorityOrder)
  priorityOrderRef.current = priorityOrder

  // ── テーマ・文字色適用 ──────────────────────────────────────────────────

  useEffect(() => {
    if (!settings) return
    const theme = settings.display?.theme ?? 'washi'
    document.documentElement.dataset.theme = theme
    // エディタ本文色の上書き（空 = テーマ既定のまま。--kg-editor-text はエディタ内のみに作用）
    const isLightTheme = theme === 'light' || theme === 'washi'
    const customColor = isLightTheme
      ? (settings.display?.textColorLight ?? '')
      : (settings.display?.textColorDark ?? '')
    if (customColor) {
      document.documentElement.style.setProperty('--kg-editor-text', customColor)
    } else {
      document.documentElement.style.removeProperty('--kg-editor-text')
    }
  }, [settings])

  // ── フォント・折り返しを view へ即時反映するヘルパー ────────────────────
  // タブ切り替えで view.setState() を呼ぶと Compartment が初期値に戻るため、
  // setState の直後にもここを呼ぶ（settings 変化時の useEffect と同じ処理）

  const settingsRef = useRef<AppSettings | null>(settings)
  settingsRef.current = settings

  const applyDisplayToView = useCallback((view: EditorView, s: AppSettings) => {
    const wrapExt = s.display?.wordWrap !== false ? EditorView.lineWrapping : []
    view.dispatch({ effects: [
      fontCompartment.reconfigure(buildFontTheme(s)),
      wrapCompartment.reconfigure(wrapExt)
    ]})
  }, [])

  // ── フォント・折り返し設定をエディタに反映 ──────────────────────────────

  useEffect(() => {
    const view = viewRef.current
    if (!view || !settings) return
    console.log('[font effect] fontSize=', settings.display?.fontSize, 'theme=', settings.display?.theme)
    applyDisplayToView(view, settings)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings])  // settings 全体を監視（個別フィールドでは初回ロード時の view未生成を検出できない）

  // ── メニュー「表示」からのコマンドを受け取る ─────────────────────────────

  useEffect(() => {
    let callCount = 0
    const off = window.api.onMenuDisplay((action, value) => {
      callCount++
      const thisCall = callCount
      console.log(`[onMenuDisplay] action=${action} value=${String(value)} callCount=${thisCall}`)
      setSettings((prev) => {
        if (!prev) return prev
        const d = { ...prev.display }
        if (action === 'theme') d.theme = value as AppSettings['display']['theme']
        if (action === 'boldText') d.boldText = value as boolean
        if (action === 'wordWrap') d.wordWrap = value as boolean
        if (action === 'fontSizeUp') d.fontSize = Math.min(d.fontSize + 2, 40)
        if (action === 'fontSizeDown') d.fontSize = Math.max(d.fontSize - 2, 10)
        console.log(`[onMenuDisplay] prev.fontSize=${prev.display?.fontSize} next.fontSize=${d.fontSize} callCount=${thisCall}`)
        const next = { ...prev, display: d }
        window.api.settings.save(next)
        return next
      })
    })
    return off
  }, [])

  // ── タイトル（tabs / activeTabId の変化に追従）────────────────────────

  useEffect(() => {
    const activeTab = tabs.find((t) => t.id === activeTabId)
    if (!activeTab) { window.api.setTitle(APP_NAME); return }
    const name = activeTab.filePath ? basename(activeTab.filePath) : '無題'
    window.api.setTitle(`${APP_NAME} — ${name}${activeTab.dirty ? ' *' : ''}`)
  }, [tabs, activeTabId])

  // ── 設定の読み込み ────────────────────────────────────────────────────

  useEffect(() => {
    window.api.settings.load().then((s) =>
      setSettings({
        windowBounds: s.windowBounds,
        autosave: { ...s.autosave },
        dictSort: {
          byFrequency: s.dictSort?.byFrequency ?? DEFAULT_SETTINGS.dictSort.byFrequency,
          showCount: s.dictSort?.showCount ?? DEFAULT_SETTINGS.dictSort.showCount,
          maxCandidates: s.dictSort?.maxCandidates ?? DEFAULT_SETTINGS.dictSort.maxCandidates
        },
        display: { ...DEFAULT_SETTINGS.display, ...s.display },
        dictPriorityOrder: s.dictPriorityOrder ?? [],
        defaultDictNames: s.defaultDictNames ?? []
      })
    )
  }, [])

  // ── 自動保存タイマー（settings が確定してから起動）─────────────────

  useEffect(() => {
    if (!settings?.autosave.enabled) return
    const ms = settings.autosave.intervalMinutes * 60 * 1000
    const timer = setInterval(async () => {
      const view = viewRef.current
      const activeId = activeTabIdRef.current
      for (const tab of tabsRef.current) {
        if (!tab.dirty || tab.missing) continue
        const content = tab.id === activeId && view
          ? view.state.doc.toString()
          : tab.editorState.doc.toString()
        if (!content.trim()) continue
        const baseName = tab.filePath ? basename(tab.filePath) : 'untitled'
        await window.api.autosave.save(content, baseName)
      }
    }, ms)
    return () => clearInterval(timer)
  }, [settings?.autosave.enabled, settings?.autosave.intervalMinutes])

  // ── 辞書一覧＋優先度（初回＋管理ウィンドウからの更新通知で再取得）────────

  useEffect(() => {
    Promise.all([
      window.api.dict.listDicts(),
      window.api.dict.getPriorityOrder()
    ]).then(([dicts, order]) => {
      setDictList(dicts)
      setPriorityOrder(order)
    })
    return window.api.dict.onListUpdated(() => {
      Promise.all([
        window.api.dict.listDicts(),
        window.api.dict.getPriorityOrder()
      ]).then(([dicts, order]) => {
        setDictList(dicts)
        setPriorityOrder(order)
      })
    })
  }, [])

  // ── F11 集中モード / Ctrl++/- フォントサイズ ────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'F11') {
        e.preventDefault()
        setFocusMode((v) => !v)
        return
      }
      // Ctrl++（= または +）/ Ctrl+-（- またはテンキー-）でフォントサイズ変更
      if (e.ctrlKey && !e.shiftKey && !e.altKey) {
        if (e.key === '+' || e.key === '=') {
          e.preventDefault()
          setSettings((prev) => {
            if (!prev) return prev
            const next = { ...prev, display: { ...prev.display, fontSize: Math.min(prev.display.fontSize + 2, 40) } }
            window.api.settings.save(next)
            return next
          })
        } else if (e.key === '-') {
          e.preventDefault()
          setSettings((prev) => {
            if (!prev) return prev
            const next = { ...prev, display: { ...prev.display, fontSize: Math.max(prev.display.fontSize - 2, 10) } }
            window.api.settings.save(next)
            return next
          })
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // 集中モード解除時にエディタへフォーカスを戻す
  useEffect(() => {
    if (!focusMode) {
      setTimeout(() => viewRef.current?.focus(), 0)
    }
  }, [focusMode])

  // ── モーダルヘルパー ──────────────────────────────────────────────────

  const closePopup = useCallback(() => setPopup(null), [])

  const showInput = useCallback(
    (message: string, defaultValue?: string): Promise<string | null> =>
      new Promise((resolve) => {
        setModal({
          message,
          defaultValue,
          onOk: (val) => { setModal(null); resolve(val) }
        })
      }),
    []
  )

  const showConfirm = useCallback(
    (message: string): Promise<boolean> =>
      new Promise((resolve) => {
        setConfirm({
          message,
          onOk: () => { setConfirm(null); resolve(true) },
          onCancel: () => { setConfirm(null); resolve(false) }
        })
      }),
    []
  )

  const showFlash = useCallback((msg: string, durationMs = 2000) => {
    if (statusMsgTimerRef.current) clearTimeout(statusMsgTimerRef.current)
    setStatusMsg(msg)
    statusMsgTimerRef.current = setTimeout(() => setStatusMsg(null), durationMs)
  }, [])

  const showMultiUnsaved = useCallback(
    (tabs: UnsavedTabInfo[], autosaveEnabled: boolean): Promise<MultiUnsavedResult> =>
      new Promise((resolve) => {
        setMultiUnsaved({
          tabs,
          autosaveEnabled,
          onResult: (r) => { setMultiUnsaved(null); resolve(r) }
        })
      }),
    []
  )

  // ── 行番号ジャンプ ──────────────────────────────────────────────────────

  const handleLineJump = useCallback(async () => {
    const view = viewRef.current
    if (!view) return
    const input = await showInput('ジャンプ先の行番号を入力してください:')
    // Enter keydown がエディタに漏れないよう、次イベントループでフォーカス＋移動する
    setTimeout(() => {
      if (input) {
        const lineNum = parseInt(input, 10)
        if (!isNaN(lineNum)) {
          const doc = view.state.doc
          const clamped = Math.max(1, Math.min(lineNum, doc.lines))
          view.dispatch({
            selection: { anchor: doc.line(clamped).from },
            scrollIntoView: true
          })
        }
      }
      view.focus()
    }, 0)
  }, [showInput])

  const handleLineJumpRef = useRef(handleLineJump)
  handleLineJumpRef.current = handleLineJump

  // ── 変換候補ポップアップ ──────────────────────────────────────────────

  const calcPopupPos = useCallback((view: EditorView, candidatesCount: number): { top: number; left: number } => {
    const pos = view.state.selection.main.head
    const coords = view.coordsAtPos(pos)
    if (!coords) return { top: 0, left: 0 }
    // 実際の候補数から高さを計算（fontSize:15px + padding:4px×2 ≒ 28px/行）
    const ITEM_H = 28, POPUP_H_MAX = 320, POPUP_W = 180
    const actualH = Math.min(candidatesCount * ITEM_H + 2, POPUP_H_MAX)
    const viewRect = view.dom.getBoundingClientRect()
    let top = coords.bottom + 2
    let left = coords.left
    // 画面下端を超えるときだけ反転し、実高分だけ持ち上げる
    if (top + actualH > window.innerHeight - 8) top = coords.top - actualH - 2
    if (left + POPUP_W > viewRect.right - 4) left = Math.max(viewRect.left + 4, viewRect.right - POPUP_W - 4)
    return { top, left }
  }, [])

  const triggerSearch = useCallback(async (view: EditorView) => {
    if (isComposingRef.current) return
    const pos = view.state.selection.main.head
    const textBefore = view.state.doc.sliceString(Math.max(0, pos - MAX_SEARCH_LEN), pos)
    const result = await window.api.dict.getCandidates(textBefore)
    if (!result) { closePopup(); return }
    setPopup({
      candidates: result.candidates,
      reading: result.reading,
      selectedIndex: 0,
      position: calcPopupPos(view, result.candidates.length)
    })
  }, [closePopup, calcPopupPos])

  const confirmCandidate = useCallback((index: number) => {
    const view = viewRef.current
    const p = popupRef.current
    if (!view || !p) return
    const candidate = p.candidates[index]
    const { word, dictName } = candidate
    const pos = view.state.selection.main.head
    const from = pos - p.reading.length
    view.dispatch({
      changes: { from, to: pos, insert: word },
      selection: { anchor: from + word.length }
    })
    window.api.dict.recordUsage(dictName, p.reading, word)
    closePopup()
    view.focus()
  }, [closePopup])

  // extensions から参照するため ref 経由で最新コールバックを渡す
  const triggerSearchRef = useRef(triggerSearch)
  const confirmCandidateRef = useRef(confirmCandidate)
  const closePopupRef = useRef(closePopup)
  const handleQuickRegisterRef = useRef<() => void>(() => {})
  const openSearchRef = useRef<(withReplace: boolean) => void>(() => {})
  triggerSearchRef.current = triggerSearch
  confirmCandidateRef.current = confirmCandidate
  closePopupRef.current = closePopup

  openSearchRef.current = (withReplace: boolean) => {
    setShowSearch(true)
    setShowReplace(withReplace)
  }

  // ── 簡易登録（RegisterModal を使う） ────────────────────────────────

  const handleQuickRegister = useCallback(() => {
    const view = viewRef.current
    if (!view) return
    const { from, to } = view.state.selection.main
    if (from === to) return
    const selectedText = view.state.doc.sliceString(from, to)
    const currentDictNames = activeDictNamesRef.current
    setRegisterState({ selectedText, activeDictNames: currentDictNames })
  }, [])

  const handleRegisterOk = useCallback(async (targetDict: string, reading: string) => {
    const view = viewRef.current
    const registerInfo = registerState
    if (!registerInfo) return

    setRegisterState(null)

    // 辞書が存在しない場合は新規作成
    const allDicts = dictList
    let dictName = targetDict
    if (!allDicts.includes(targetDict)) {
      const ok = await window.api.dict.createDict(targetDict)
      if (!ok) { view?.focus(); return }
      setDictList((prev) => [...prev, targetDict].sort())
      dictName = targetDict
      // 新規作成した辞書をアクティブに追加
      const activeId = activeTabIdRef.current
      const tab = tabsRef.current.find((t) => t.id === activeId)
      if (tab && !tab.dictNames.includes(dictName)) {
        const newNames = sortByPriority([...tab.dictNames, dictName], priorityOrderRef.current)
        setTabs((prev) => prev.map((t) => t.id === activeId ? { ...t, dictNames: newNames } : t))
        await window.api.dict.setActiveDicts(newNames)
      }
    }

    await window.api.dict.addEntry(dictName, reading, [registerInfo.selectedText])
    view?.focus()
  }, [registerState, dictList])

  handleQuickRegisterRef.current = handleQuickRegister

  // ── 右クリックコンテキストメニュー ────────────────────────────────────────

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const view = viewRef.current
    const hasSelection = view ? !view.state.selection.main.empty : false
    window.api.contextMenu.show(hasSelection)
  }, [])

  useEffect(() => {
    return window.api.contextMenu.onDictRegister(() => {
      handleQuickRegisterRef.current()
    })
  }, [])

  // ── タブ操作 ─────────────────────────────────────────────────────────

  const makeNewTab = useCallback((overrideDictNames?: string[]): Tab => {
    const base = overrideDictNames ?? (settings?.defaultDictNames ?? [])
    return {
      id: newTabId(),
      filePath: null,
      editorState: EditorState.create({ doc: '', extensions: extensionsRef.current! }),
      dirty: false,
      missing: false,
      dictNames: sortByPriority(
        base.filter((n) => dictList.includes(n)),
        priorityOrderRef.current
      )
    }
  }, [settings, dictList])

  const makeMissingTab = useCallback((filePath: string, dictNames: string[]): Tab => ({
    id: newTabId(),
    filePath,
    editorState: EditorState.create({
      doc: '',
      extensions: [...extensionsRef.current!, EditorView.editable.of(false)]
    }),
    dirty: false,
    missing: true,
    dictNames
  }), [])

  const switchTab = useCallback(async (newId: string) => {
    const view = viewRef.current
    const currentId = activeTabIdRef.current
    if (!view || newId === currentId) return

    const currentState = view.state
    if (currentId) {
      setTabs((prev) =>
        prev.map((t) => (t.id === currentId ? { ...t, editorState: currentState } : t))
      )
    }

    const newTab = tabsRef.current.find((t) => t.id === newId)
    if (!newTab) return

    setActiveTabId(newId)
    view.setState(newTab.editorState)
    const s = settingsRef.current
    if (s) applyDisplayToView(view, s)
    await window.api.dict.setActiveDicts(newTab.dictNames)
    closePopupRef.current()
    view.focus()
  }, [applyDisplayToView])

  const closeTab = useCallback(async (id: string) => {
    const tab = tabsRef.current.find((t) => t.id === id)
    if (!tab) return

    if (tab.dirty) {
      const name = tab.filePath ? basename(tab.filePath) : '無題'
      const ok = await showConfirm(
        `「${name}」は保存されていません。\n閉じてよろしいですか？`
      )
      if (!ok) { viewRef.current?.focus(); return }
    }

    const currentTabs = tabsRef.current
    const idx = currentTabs.findIndex((t) => t.id === id)
    const remaining = currentTabs.filter((t) => t.id !== id)

    if (remaining.length === 0) {
      const freshSettings = await window.api.settings.load()
      const newTab = makeNewTab(freshSettings.defaultDictNames ?? [])
      setTabs([newTab])
      setActiveTabId(newTab.id)
      const v0 = viewRef.current
      if (v0) {
        v0.setState(newTab.editorState)
        const s0 = settingsRef.current
        if (s0) applyDisplayToView(v0, s0)
      }
      await window.api.dict.setActiveDicts(newTab.dictNames)
      closePopupRef.current()
      viewRef.current?.focus()
      return
    }

    setTabs(remaining)
    if (id === activeTabIdRef.current) {
      const next = remaining[Math.min(idx, remaining.length - 1)]
      setActiveTabId(next.id)
      const v1 = viewRef.current
      if (v1) {
        v1.setState(next.editorState)
        const s1 = settingsRef.current
        if (s1) applyDisplayToView(v1, s1)
      }
      await window.api.dict.setActiveDicts(next.dictNames)
      closePopupRef.current()
      viewRef.current?.focus()
    }
  }, [makeNewTab, showConfirm, applyDisplayToView])

  // ── ファイル操作 ──────────────────────────────────────────────────────

  const openFileAsNewTab = useCallback(async (
    filePath: string,
    content: string,
    dictNames: string[] = []
  ) => {
    const state = EditorState.create({ doc: content, extensions: extensionsRef.current! })
    const newTab: Tab = {
      id: newTabId(), filePath, editorState: state,
      dirty: false, missing: false, dictNames
    }
    const view = viewRef.current
    const currentId = activeTabIdRef.current
    const currentState = view?.state

    setTabs((prev) => {
      const updated = currentState && currentId
        ? prev.map((t) => (t.id === currentId ? { ...t, editorState: currentState } : t))
        : prev
      return [...updated, newTab]
    })
    setActiveTabId(newTab.id)
    if (view) {
      view.setState(newTab.editorState)
      const s = settingsRef.current
      if (s) applyDisplayToView(view, s)
    }
    await window.api.dict.setActiveDicts(dictNames)
    closePopupRef.current()
    view?.focus()
  }, [applyDisplayToView])

  const handleNew = useCallback(async () => {
    const freshSettings = await window.api.settings.load()
    const newTab = makeNewTab(freshSettings.defaultDictNames ?? [])
    const view = viewRef.current
    const currentId = activeTabIdRef.current
    const currentState = view?.state

    setTabs((prev) => {
      const updated = currentState && currentId
        ? prev.map((t) => (t.id === currentId ? { ...t, editorState: currentState } : t))
        : prev
      return [...updated, newTab]
    })
    setActiveTabId(newTab.id)
    if (view) {
      view.setState(newTab.editorState)
      const s = settingsRef.current
      if (s) applyDisplayToView(view, s)
    }
    await window.api.dict.setActiveDicts(newTab.dictNames)
    closePopupRef.current()
    view?.focus()
  }, [makeNewTab, applyDisplayToView])

  const handleOpen = useCallback(async () => {
    const result = await window.api.openFile()
    if (!result) return

    const existing = tabsRef.current.find((t) => t.filePath === result.path)
    if (existing) { switchTab(existing.id); return }

    await openFileAsNewTab(result.path, result.content)
  }, [switchTab, openFileAsNewTab])

  const handleSave = useCallback(async () => {
    const view = viewRef.current
    const activeId = activeTabIdRef.current
    const activeTab = tabsRef.current.find((t) => t.id === activeId)
    if (!view || !activeTab || activeTab.missing) return

    const content = view.state.doc.toString()
    if (!activeTab.filePath) {
      const result = await window.api.saveFileAs(content)
      if (!result || !result.success) return
      setTabs((prev) =>
        prev.map((t) => (t.id === activeId ? { ...t, filePath: result.path, dirty: false } : t))
      )
    } else {
      const result = await window.api.saveFile(activeTab.filePath, content)
      if (!result.success) return
      setTabs((prev) => prev.map((t) => (t.id === activeId ? { ...t, dirty: false } : t)))
      showFlash('保存しました')
      if (saveFlashTimerRef.current) clearTimeout(saveFlashTimerRef.current)
      setSaveFlash(true)
      saveFlashTimerRef.current = setTimeout(() => setSaveFlash(false), 1500)
    }
  }, [showFlash])

  const handleSaveAs = useCallback(async () => {
    const view = viewRef.current
    const activeId = activeTabIdRef.current
    const activeTab = tabsRef.current.find((t) => t.id === activeId)
    if (!view || !activeTab || activeTab.missing) return

    const result = await window.api.saveFileAs(view.state.doc.toString())
    if (!result || !result.success) return
    setTabs((prev) =>
      prev.map((t) => (t.id === activeId ? { ...t, filePath: result.path, dirty: false } : t))
    )
  }, [])

  const handleOpenFromAutosave = useCallback(async (content: string) => {
    const state = EditorState.create({ doc: content, extensions: extensionsRef.current! })
    const newTab: Tab = {
      id: newTabId(), filePath: null, editorState: state,
      dirty: true, missing: false, dictNames: []
    }
    const view = viewRef.current
    const currentId = activeTabIdRef.current
    const currentState = view?.state
    setTabs((prev) => {
      const updated = currentState && currentId
        ? prev.map((t) => (t.id === currentId ? { ...t, editorState: currentState } : t))
        : prev
      return [...updated, newTab]
    })
    setActiveTabId(newTab.id)
    if (view) {
      view.setState(newTab.editorState)
      const s = settingsRef.current
      if (s) applyDisplayToView(view, s)
    }
    await window.api.dict.setActiveDicts([])
    closePopupRef.current()
    view?.focus()
  }, [applyDisplayToView])

  // ── 辞書トグル（チェックボックスドロップダウンから呼ばれる）───────────────

  const handleDictToggle = useCallback(async (name: string, checked: boolean) => {
    const activeId = activeTabIdRef.current
    const tab = tabsRef.current.find((t) => t.id === activeId)
    if (!tab) return

    let newNames: string[]
    if (checked) {
      if (tab.dictNames.length >= MAX_ACTIVE_DICTS) return
      newNames = sortByPriority([...tab.dictNames, name], priorityOrderRef.current)
    } else {
      newNames = tab.dictNames.filter((n) => n !== name)
    }

    setTabs((prev) => prev.map((t) => (t.id === activeId ? { ...t, dictNames: newNames } : t)))
    await window.api.dict.setActiveDicts(newNames)
    closePopupRef.current()
    viewRef.current?.focus()
  }, [])

  // ── メニューイベント ──────────────────────────────────────────────────

  useEffect(() => {
    const off1 = window.api.onMenuNew(handleNew)
    const off2 = window.api.onMenuOpen(handleOpen)
    const off3 = window.api.onMenuSave(handleSave)
    const off4 = window.api.onMenuSaveAs(handleSaveAs)
    const off5 = window.api.onMenuSettings(() => setShowSettings(true))
    const off6 = window.api.onMenuAutosaveRestore(() => setShowAutosaveRestore(true))
    const off7 = window.api.onMenuShortcuts(() => setShowShortcuts(true))
    const off8 = window.api.onMenuAbout(() => setShowAbout(true))
    return () => { off1(); off2(); off3(); off4(); off5(); off6(); off7(); off8() }
  }, [handleNew, handleOpen, handleSave, handleSaveAs])

  // ── 2重起動でファイルを受け取る ───────────────────────────────────────

  useEffect(() => {
    return window.api.onAppOpenFile(async (filePath: string) => {
      const existing = tabsRef.current.find((t) => t.filePath === filePath)
      if (existing) { switchTab(existing.id); return }

      const fileData = await window.api.openFilePath(filePath)
      if (fileData) {
        await openFileAsNewTab(filePath, fileData.content)
      } else {
        const missingTab = makeMissingTab(filePath, [])
        const view = viewRef.current
        const currentId = activeTabIdRef.current
        const currentState = view?.state
        setTabs((prev) => {
          const updated = currentState && currentId
            ? prev.map((t) => (t.id === currentId ? { ...t, editorState: currentState } : t))
            : prev
          return [...updated, missingTab]
        })
        setActiveTabId(missingTab.id)
        view?.setState(missingTab.editorState)
        await window.api.dict.setActiveDicts([])
        closePopupRef.current()
        view?.focus()
      }
    })
  }, [switchTab, openFileAsNewTab, makeMissingTab])

  // ── ウィンドウを閉じる前にセッション保存 ─────────────────────────────

  useEffect(() => {
    return window.api.onBeforeClose(async () => {
      const view = viewRef.current
      const currentId = activeTabIdRef.current
      const allTabs = tabsRef.current
      const autosaveEnabled = settingsRef.current?.autosave.enabled ?? true

      // 閉じる前に全ダーティタブを autosave へ明示 flush
      for (const tab of allTabs) {
        if (!tab.dirty || tab.missing) continue
        const content = tab.id === currentId && view
          ? view.state.doc.toString()
          : tab.editorState.doc.toString()
        if (!content.trim()) continue
        const baseName = tab.filePath ? basename(tab.filePath) : '無題'
        await window.api.autosave.save(content, baseName)
      }

      // 未保存タブの確認
      const dirtyTabs = allTabs.filter((t) => t.dirty && !t.missing)
      if (dirtyTabs.length === 1) {
        const tab = dirtyTabs[0]
        const name = tab.filePath ? basename(tab.filePath) : '無題'
        const ok = await showConfirm(`「${name}」は保存されていません。\n閉じてよろしいですか？`)
        if (!ok) return   // キャンセル → 閉じない
      } else if (dirtyTabs.length >= 2) {
        const unsavedInfos: UnsavedTabInfo[] = dirtyTabs.map((t) => ({
          id: t.id,
          name: t.filePath ? basename(t.filePath) : '無題',
          filePath: t.filePath
        }))
        const result = await showMultiUnsaved(unsavedInfos, autosaveEnabled)

        if (result.action === 'cancel') return   // キャンセル → 閉じない

        if (result.action === 'saveSelected' && result.idsToSave.length > 0) {
          // チェックされたファイルパスありタブを保存
          for (const id of result.idsToSave) {
            const tab = allTabs.find((t) => t.id === id)
            if (!tab?.filePath) continue
            const content = tab.id === currentId && view
              ? view.state.doc.toString()
              : tab.editorState.doc.toString()
            await window.api.saveFile(tab.filePath, content)
          }
        }

        // autosave オフ＋無題ダーティタブがある場合の強い警告
        if (!autosaveEnabled && dirtyTabs.some((t) => !t.filePath)) {
          const ok = await showConfirm(
            '自動保存が無効のため、無題のタブの変更は失われます。\n本当に閉じてよろしいですか？'
          )
          if (!ok) return
        }
      }

      // セッション保存 → 閉じる
      const sessionTabs = allTabs.map((t) => {
        const state = t.id === currentId && view ? view.state : t.editorState
        return {
          filePath: t.filePath,
          cursorPos: state.selection.main.head,
          dictNames: t.dictNames
        }
      })
      const activeIdx = Math.max(0, allTabs.findIndex((t) => t.id === currentId))
      await window.api.saveSession({ tabs: sessionTabs, activeTabIndex: activeIdx })
      window.api.confirmClose()
    })
  }, [showConfirm, showMultiUnsaved])

  // ── CodeMirror 初期化 ＋ セッション復元 ──────────────────────────────

  useEffect(() => {
    if (!editorRef.current) return

    const onUpdate = EditorView.updateListener.of((update) => {
      // dirty フラグ
      if (update.docChanged) {
        const activeId = activeTabIdRef.current
        const activeTab = tabsRef.current.find((t) => t.id === activeId)
        if (activeTab && !activeTab.dirty && !activeTab.missing) {
          setTabs((prev) =>
            prev.map((t) => (t.id === activeId ? { ...t, dirty: true } : t))
          )
        }
      }

      // ステータスバー更新
      if (update.docChanged || update.selectionSet) {
        const state = update.state
        const pos = state.selection.main.head
        const line = state.doc.lineAt(pos)
        const { from, to } = state.selection.main
        const selText = from !== to ? state.doc.sliceString(from, to) : null

        // 文字数（空白・改行除く）
        const text = state.doc.toString()
        const charCount = text.replace(/\s/g, '').length

        // セッション開始文字数の初期化（初回確定後）
        if (sessionStartCharsRef.current === null && update.docChanged) {
          sessionStartCharsRef.current = charCount
        }
        const sessionDelta = sessionStartCharsRef.current !== null
          ? Math.max(0, charCount - sessionStartCharsRef.current)
          : 0

        setStatusInfo({ line: line.number, col: pos - line.from + 1, charCount, selText, sessionDelta })
      }
    })

    const popupKeymap = keymap.of([
      {
        key: 'ArrowDown',
        run: () => {
          if (!popupRef.current) return false
          setPopup((p) =>
            p ? { ...p, selectedIndex: (p.selectedIndex + 1) % p.candidates.length } : null
          )
          return true
        }
      },
      {
        key: 'ArrowUp',
        run: () => {
          if (!popupRef.current) return false
          setPopup((p) =>
            p
              ? { ...p, selectedIndex: (p.selectedIndex - 1 + p.candidates.length) % p.candidates.length }
              : null
          )
          return true
        }
      },
      {
        key: 'Enter',
        run: () => {
          if (!popupRef.current) return false
          confirmCandidateRef.current(popupRef.current.selectedIndex)
          return true
        }
      },
      {
        key: 'Escape',
        run: () => {
          if (!popupRef.current) return false
          closePopupRef.current()
          return true
        }
      },
      {
        key: 'Mod-d',
        run: () => { handleQuickRegisterRef.current(); return true }
      }
    ])

    // Ctrl+F / Ctrl+H / Ctrl+G を最高優先で奪う（search() の組み込みバインドより先）
    const searchKeymap = Prec.highest(keymap.of([
      {
        key: 'Mod-f',
        run: () => { openSearchRef.current(false); return true }
      },
      {
        key: 'Mod-h',
        run: () => { openSearchRef.current(true); return true }
      },
      {
        key: 'Mod-g',
        run: () => { handleLineJumpRef.current(); return true }
      }
    ]))

    const domHandlers = EditorView.domEventHandlers({
      compositionstart: () => { isComposingRef.current = true; return false },
      compositionend: (_e, view) => {
        isComposingRef.current = false
        setTimeout(() => triggerSearchRef.current(view), 0)
        return false
      },
      keyup: (e, view) => {
        const skip = ['ArrowUp', 'ArrowDown', 'Enter', 'Escape', 'Tab']
        if (!isComposingRef.current && !skip.includes(e.key)) {
          triggerSearchRef.current(view)
        }
        return false
      }
    })

    const sharedExtensions: Extension[] = [
      history(),
      lineNumbers(),
      highlightActiveLine(),
      searchKeymap,
      popupKeymap,
      keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
      // @codemirror/search: ハイライト機構のみ使用。パネルUIはカスタムReactパネルで代替
      search({ createPanel: () => ({ dom: document.createElement('div') }) }),
      onUpdate,
      domHandlers,
      // フォント・太字は設定に応じて動的再構成
      fontCompartment.of(buildFontTheme(null)),
      // 折り返しは設定に応じて動的再構成（既定: on）
      wrapCompartment.of(EditorView.lineWrapping)
    ]
    extensionsRef.current = sharedExtensions

    const initialTab: Tab = {
      id: newTabId(),
      filePath: null,
      editorState: EditorState.create({ doc: '', extensions: sharedExtensions }),
      dirty: false,
      missing: false,
      dictNames: []
    }

    const view = new EditorView({ state: initialTab.editorState, parent: editorRef.current })
    viewRef.current = view
    setTabs([initialTab])
    setActiveTabId(initialTab.id)

    // セッション復元
    window.api.loadSession().then(async (session) => {
      if (!session || session.tabs.length === 0) { view.focus(); return }

      const restoredTabs: Tab[] = []
      for (const st of session.tabs) {
        // M7移行: 旧セッション dictName(単一) → dictNames(配列) に変換
        const dictNames: string[] = Array.isArray(st.dictNames)
          ? st.dictNames
          : st.dictName ? [st.dictName] : []

        if (!st.filePath) {
          restoredTabs.push({
            id: newTabId(), filePath: null,
            editorState: EditorState.create({ doc: '', extensions: sharedExtensions }),
            dirty: false, missing: false, dictNames
          })
        } else {
          const fileData = await window.api.openFilePath(st.filePath)
          if (fileData) {
            restoredTabs.push({
              id: newTabId(), filePath: st.filePath,
              editorState: EditorState.create({
                doc: fileData.content,
                extensions: sharedExtensions,
                selection: { anchor: Math.min(st.cursorPos, fileData.content.length) }
              }),
              dirty: false, missing: false, dictNames
            })
          } else {
            restoredTabs.push({
              id: newTabId(), filePath: st.filePath,
              editorState: EditorState.create({
                doc: '',
                extensions: [...sharedExtensions, EditorView.editable.of(false)]
              }),
              dirty: false, missing: true, dictNames
            })
          }
        }
      }

      if (restoredTabs.length === 0) { view.focus(); return }

      const activeIdx = Math.min(session.activeTabIndex, restoredTabs.length - 1)
      const activeTab = restoredTabs[activeIdx]

      setTabs(restoredTabs)
      setActiveTabId(activeTab.id)
      view.setState(activeTab.editorState)
      const s = settingsRef.current
      if (s) applyDisplayToView(view, s)
      await window.api.dict.setActiveDicts(activeTab.dictNames)
      view.focus()
    })

    return () => view.destroy()
  }, [])

  // ── 描画 ──────────────────────────────────────────────────────────────

  const displaySettings = settings?.display ?? { theme: 'light', showWritingStats: false, wordGoal: 0 }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', margin: 0, background: 'var(--kg-bg-primary)', color: 'var(--kg-text-primary)' }}>

      {/* タブバー（集中モードでは非表示） */}
      {!focusMode && (
        <div style={{
          display: 'flex', alignItems: 'stretch',
          background: 'var(--kg-bg-tertiary)', borderBottom: '1px solid var(--kg-border-strong)',
          overflowX: 'auto', flexShrink: 0, minHeight: 34
        }}>
          {tabs.map((tab) => {
            const name = tab.filePath ? basename(tab.filePath) : '無題'
            const isActive = tab.id === activeTabId
            return (
              <div
                key={tab.id}
                onClick={() => switchTab(tab.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '5px 10px 5px 12px',
                  background: isActive ? 'var(--kg-tab-active)' : 'transparent',
                  borderRight: '1px solid var(--kg-border-strong)',
                  cursor: 'pointer', fontSize: 13,
                  color: tab.missing ? 'var(--kg-missing-text)' : 'var(--kg-text-primary)',
                  whiteSpace: 'nowrap',
                  boxShadow: isActive ? 'inset 0 2px 0 var(--kg-accent)' : 'none',
                  userSelect: 'none'
                }}
              >
                {tab.missing && <span title="ファイルが見つかりません">⚠</span>}
                <span>{name}{tab.dirty ? ' *' : ''}</span>
                <span
                  onClick={(e) => { e.stopPropagation(); closeTab(tab.id) }}
                  title="閉じる"
                  style={{
                    marginLeft: 3, fontSize: 15, lineHeight: 1,
                    color: 'var(--kg-text-muted)', cursor: 'pointer', padding: '1px 3px',
                    borderRadius: 3
                  }}
                >×</span>
              </div>
            )
          })}
          <button
            onClick={handleNew}
            title="新しいタブ (Ctrl+N)"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '4px 12px', fontSize: 20, color: 'var(--kg-text-secondary)',
              lineHeight: 1, alignSelf: 'center'
            }}
          >+</button>
        </div>
      )}

      {/* ツールバー（集中モードでは非表示）*/}
      {/* 構成: [新規][開く][保存] | [検索][集中][設定] | 辞書DD（最右端） */}
      {!focusMode && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 2,
          padding: '3px 8px', background: 'var(--kg-bg-secondary)', borderBottom: '1px solid var(--kg-border)',
          fontSize: '13px', flexShrink: 0
        }}>
          {/* 左グループ: ファイル操作 */}
          <button onClick={handleNew} title="新規 (Ctrl+N)" aria-label="新規" className="kg-tb-btn">
            <TbIcon paths={ICONS.fileNew} aria-hidden />
          </button>
          <button onClick={handleOpen} title="開く (Ctrl+O)" aria-label="開く" className="kg-tb-btn">
            <TbIcon paths={ICONS.folderOpen} aria-hidden />
          </button>
          <button
            onClick={handleSave}
            title="保存 (Ctrl+S)"
            aria-label="保存"
            className="kg-tb-btn"
            style={saveFlash ? { color: 'var(--kg-accent)' } : undefined}
          >
            <TbIcon paths={saveFlash ? ICONS.check : ICONS.save} aria-hidden />
          </button>

          {/* セパレータ */}
          <div style={{ width: 1, height: 18, background: 'var(--kg-border-strong)', margin: '0 6px', flexShrink: 0 }} />

          {/* 中グループ: 表示操作 */}
          <button
            onClick={() => openSearchRef.current(false)}
            title="検索 (Ctrl+F)"
            aria-label="検索"
            className="kg-tb-btn"
          ><TbIcon paths={ICONS.search} aria-hidden /></button>
          <button
            onClick={() => setFocusMode((v) => !v)}
            title="集中モード (F11)"
            aria-label="集中モード"
            className="kg-tb-btn"
          ><TbIcon paths={ICONS.maximize} aria-hidden /></button>
          <button
            onClick={() => setShowSettings(true)}
            title="設定 (Ctrl+,)"
            aria-label="設定"
            className="kg-tb-btn"
          ><TbIcon paths={ICONS.settings} aria-hidden /></button>

          {/* セパレータ */}
          <div style={{ width: 1, height: 18, background: 'var(--kg-border-strong)', margin: '0 6px', flexShrink: 0 }} />

          {/* 辞書ドロップダウン（固定ボタンの右隣・可変幅を端に隔離） */}
          <DictSelector
            dictList={dictList}
            priorityOrder={priorityOrder}
            activeDictNames={activeDictNames}
            onToggle={handleDictToggle}
            onOpenManager={() => window.api.dict.openManager()}
          />
        </div>
      )}

      {/* 検索・置換パネル（集中モードでは CSS で非表示。アンマウントしない=F11 でフォーカスが奪われない） */}
      <div style={{ display: focusMode ? 'none' : undefined }}>
        <SearchPanel
          viewRef={viewRef}
          show={showSearch}
          showReplace={showReplace}
          onToggleReplace={() => setShowReplace((v) => !v)}
          onClose={() => {
            setShowSearch(false)
            setShowReplace(false)
          }}
        />
      </div>

      {/* エディタ本体 */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        <div ref={editorRef} style={{ width: '100%', height: '100%' }} onContextMenu={handleContextMenu} />

        {/* 集中モード中のヒント */}
        {focusMode && (
          <div style={{
            position: 'absolute', bottom: 8, right: 12,
            fontSize: 11, color: 'var(--kg-text-muted)', pointerEvents: 'none'
          }}>
            F11 で集中モード終了
          </div>
        )}

        {/* ファイルが見つからない場合のオーバーレイ */}
        {activeTab?.missing && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            background: 'var(--kg-bg-secondary)', color: 'var(--kg-text-secondary)'
          }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>⚠</div>
            <div style={{ fontWeight: 'bold', marginBottom: 8, color: 'var(--kg-missing-text)', fontSize: 15 }}>
              ファイルが見つかりませんでした
            </div>
            <div style={{ color: 'var(--kg-text-muted)', fontSize: 13, marginBottom: 6, maxWidth: 500, textAlign: 'center', wordBreak: 'break-all' }}>
              {activeTab.filePath}
            </div>
            <div style={{ color: 'var(--kg-text-muted)', fontSize: 12 }}>
              ファイルが移動または削除された可能性があります
            </div>
          </div>
        )}
      </div>

      {/* ステータスバー（集中モードでは非表示） */}
      {!focusMode && (
        <StatusBar
          info={statusInfo}
          showWritingStats={displaySettings.showWritingStats}
          wordGoal={displaySettings.wordGoal}
          onLineJump={handleLineJump}
          flashMessage={statusMsg}
        />
      )}

      {/* 変換候補ポップアップ */}
      {popup && (
        <CandidatePopup
          candidates={popup.candidates.map((c) => c.word)}
          selectedIndex={popup.selectedIndex}
          position={popup.position}
          onSelect={confirmCandidate}
        />
      )}

      {/* 辞書登録モーダル（Ctrl+D / 右クリック） */}
      {registerState && (
        <RegisterModal
          selectedText={registerState.selectedText}
          activeDictNames={registerState.activeDictNames}
          allDictNames={dictList}
          onOk={handleRegisterOk}
          onCancel={() => { setRegisterState(null); viewRef.current?.focus() }}
        />
      )}

      {/* 入力モーダル */}
      {modal && (
        <InputModal
          message={modal.message}
          defaultValue={modal.defaultValue}
          onOk={modal.onOk}
          onCancel={() => { setModal(null); viewRef.current?.focus() }}
        />
      )}

      {/* 確認モーダル */}
      {confirm && (
        <ConfirmModal
          message={confirm.message}
          onOk={confirm.onOk}
          onCancel={confirm.onCancel}
        />
      )}

      {/* 設定モーダル */}
      {showSettings && (
        <SettingsModal
          dictList={dictList}
          priorityOrder={priorityOrder}
          onClose={() => setShowSettings(false)}
          onSave={(newSettings) => setSettings(newSettings)}
        />
      )}

      {/* 自動保存から復元モーダル */}
      {showAutosaveRestore && (
        <AutosaveRestoreModal
          onClose={() => setShowAutosaveRestore(false)}
          onOpen={handleOpenFromAutosave}
        />
      )}

      {/* 複数未保存ファイル選択保存モーダル */}
      {multiUnsaved && (
        <MultiUnsavedModal
          tabs={multiUnsaved.tabs}
          autosaveEnabled={multiUnsaved.autosaveEnabled}
          onResult={multiUnsaved.onResult}
        />
      )}

      {/* ショートカット一覧 */}
      {showShortcuts && <ShortcutModal onClose={() => setShowShortcuts(false)} />}

      {/* このアプリについて */}
      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}
    </div>
  )
}

export default App
