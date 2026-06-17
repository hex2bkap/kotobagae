import { useEffect, useRef, useCallback, useState } from 'react'
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view'
import { EditorState, Extension } from '@codemirror/state'
import { defaultKeymap, historyKeymap, history, indentWithTab } from '@codemirror/commands'
import { CandidatePopup } from './components/CandidatePopup'
import { InputModal } from './components/InputModal'
import { ConfirmModal } from './components/ConfirmModal'
import { SettingsModal } from './components/SettingsModal'
import { AutosaveRestoreModal } from './components/AutosaveRestoreModal'
import { basename } from './utils/path'
import type { AppSettings } from '../../shared/settings-types'

const APP_NAME = 'コトバガエ'
const MAX_SEARCH_LEN = 10

interface Tab {
  id: string
  filePath: string | null
  editorState: EditorState
  dirty: boolean
  missing: boolean
  dictName: string | null
}

interface PopupState {
  candidates: string[]
  reading: string
  selectedIndex: number
  position: { top: number; left: number }
}

let _tabIdCounter = 0
function newTabId(): string {
  return `t${++_tabIdCounter}`
}

function App(): JSX.Element {
  const editorRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const extensionsRef = useRef<Extension[] | null>(null)
  const isComposingRef = useRef(false)

  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [dictList, setDictList] = useState<string[]>([])
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

  // callbacks / state への参照を extensions や非同期コールバックから安全に使うための ref 群
  const tabsRef = useRef<Tab[]>(tabs)
  const activeTabIdRef = useRef<string | null>(activeTabId)
  const popupRef = useRef<PopupState | null>(popup)
  tabsRef.current = tabs
  activeTabIdRef.current = activeTabId
  popupRef.current = popup

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
      setSettings({ windowBounds: s.windowBounds, autosave: { ...s.autosave } })
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

  // ── 辞書一覧（初回＋管理ウィンドウからの更新通知で再取得）──────────────

  useEffect(() => {
    window.api.dict.listDicts().then(setDictList)
    return window.api.dict.onListUpdated(() => {
      window.api.dict.listDicts().then(setDictList)
    })
  }, [])

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

  // ── 変換候補ポップアップ ──────────────────────────────────────────────

  const calcPopupPos = useCallback((view: EditorView): { top: number; left: number } => {
    const pos = view.state.selection.main.head
    const coords = view.coordsAtPos(pos)
    if (!coords) return { top: 0, left: 0 }
    const POPUP_H = 320, POPUP_W = 180
    const viewRect = view.dom.getBoundingClientRect()
    let top = coords.bottom + 2
    let left = coords.left
    if (top + POPUP_H > window.innerHeight - 8) top = coords.top - POPUP_H - 2
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
      position: calcPopupPos(view)
    })
  }, [closePopup, calcPopupPos])

  const confirmCandidate = useCallback((index: number) => {
    const view = viewRef.current
    const p = popupRef.current
    if (!view || !p) return
    const pos = view.state.selection.main.head
    const from = pos - p.reading.length
    view.dispatch({
      changes: { from, to: pos, insert: p.candidates[index] },
      selection: { anchor: from + p.candidates[index].length }
    })
    closePopup()
    view.focus()
  }, [closePopup])

  // extensions から参照するため ref 経由で最新コールバックを渡す
  const triggerSearchRef = useRef(triggerSearch)
  const confirmCandidateRef = useRef(confirmCandidate)
  const closePopupRef = useRef(closePopup)
  const handleQuickRegisterRef = useRef<() => void>(() => {})
  triggerSearchRef.current = triggerSearch
  confirmCandidateRef.current = confirmCandidate
  closePopupRef.current = closePopup

  // ── 簡易登録 ─────────────────────────────────────────────────────────

  const handleQuickRegister = useCallback(async () => {
    const view = viewRef.current
    if (!view) return
    const { from, to } = view.state.selection.main
    if (from === to) return
    const selectedText = view.state.doc.sliceString(from, to)

    const activeId = activeTabIdRef.current
    const activeTab = tabsRef.current.find((t) => t.id === activeId)
    if (!activeTab) return

    let dictName = activeTab.dictName

    if (!dictName) {
      const newName = await showInput('登録先の辞書がありません。辞書名を入力してください:')
      if (!newName) { view.focus(); return }
      const ok = await window.api.dict.createDict(newName)
      if (!ok) { view.focus(); return }
      setDictList((prev) => [...prev, newName].sort())
      dictName = newName
      setTabs((prev) =>
        prev.map((t) => (t.id === activeId ? { ...t, dictName: newName } : t))
      )
      await window.api.dict.setActiveDict(newName)
    }

    const reading = await showInput(`「${selectedText}」の読みを入力してください:`)
    if (!reading) { view.focus(); return }
    await window.api.dict.addEntry(reading, [selectedText])
    view.focus()
  }, [showInput])

  handleQuickRegisterRef.current = handleQuickRegister

  // ── タブ操作 ─────────────────────────────────────────────────────────

  const makeNewTab = useCallback((): Tab => ({
    id: newTabId(),
    filePath: null,
    editorState: EditorState.create({ doc: '', extensions: extensionsRef.current! }),
    dirty: false,
    missing: false,
    dictName: null
  }), [])

  const makeMissingTab = useCallback((filePath: string, dictName: string | null): Tab => ({
    id: newTabId(),
    filePath,
    editorState: EditorState.create({
      doc: '',
      extensions: [...extensionsRef.current!, EditorView.editable.of(false)]
    }),
    dirty: false,
    missing: true,
    dictName
  }), [])

  const switchTab = useCallback(async (newId: string) => {
    const view = viewRef.current
    const currentId = activeTabIdRef.current
    if (!view || newId === currentId) return

    // 現在タブの最新状態を保存してからビューを切り替える
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
    await window.api.dict.setActiveDict(newTab.dictName)
    closePopupRef.current()
    view.focus()
  }, [])

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
      const newTab = makeNewTab()
      setTabs([newTab])
      setActiveTabId(newTab.id)
      viewRef.current?.setState(newTab.editorState)
      await window.api.dict.setActiveDict(null)
      closePopupRef.current()
      viewRef.current?.focus()
      return
    }

    setTabs(remaining)
    if (id === activeTabIdRef.current) {
      const next = remaining[Math.min(idx, remaining.length - 1)]
      setActiveTabId(next.id)
      viewRef.current?.setState(next.editorState)
      await window.api.dict.setActiveDict(next.dictName)
      closePopupRef.current()
      viewRef.current?.focus()
    }
  }, [makeNewTab, showConfirm])

  // ── ファイル操作 ──────────────────────────────────────────────────────

  const openFileAsNewTab = useCallback(async (
    filePath: string,
    content: string,
    dictName: string | null = null
  ) => {
    const state = EditorState.create({ doc: content, extensions: extensionsRef.current! })
    const newTab: Tab = {
      id: newTabId(), filePath, editorState: state,
      dirty: false, missing: false, dictName
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
    view?.setState(newTab.editorState)
    await window.api.dict.setActiveDict(dictName)
    closePopupRef.current()
    view?.focus()
  }, [])

  const handleNew = useCallback(async () => {
    const newTab = makeNewTab()
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
    view?.setState(newTab.editorState)
    await window.api.dict.setActiveDict(null)
    closePopupRef.current()
    view?.focus()
  }, [makeNewTab])

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
    }
  }, [])

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
      dirty: true, missing: false, dictName: null
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
    view?.setState(newTab.editorState)
    await window.api.dict.setActiveDict(null)
    closePopupRef.current()
    view?.focus()
  }, [])

  const handleDictChange = useCallback(async (name: string) => {
    if (name === '__manage__') {
      await window.api.dict.openManager()
      return
    }
    const activeId = activeTabIdRef.current
    const newName = name === '' ? null : name
    setTabs((prev) =>
      prev.map((t) => (t.id === activeId ? { ...t, dictName: newName } : t))
    )
    await window.api.dict.setActiveDict(newName)
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
    return () => { off1(); off2(); off3(); off4(); off5(); off6() }
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
        const missingTab = makeMissingTab(filePath, null)
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
        await window.api.dict.setActiveDict(null)
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
      const sessionTabs = tabsRef.current.map((t) => {
        const state = t.id === currentId && view ? view.state : t.editorState
        return {
          filePath: t.filePath,
          cursorPos: state.selection.main.head,
          dictName: t.dictName
        }
      })
      const activeIdx = Math.max(0, tabsRef.current.findIndex((t) => t.id === currentId))
      await window.api.saveSession({ tabs: sessionTabs, activeTabIndex: activeIdx })
      window.api.confirmClose()
    })
  }, [])

  // ── CodeMirror 初期化 ＋ セッション復元 ──────────────────────────────

  useEffect(() => {
    if (!editorRef.current) return

    const onUpdate = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const activeId = activeTabIdRef.current
        const activeTab = tabsRef.current.find((t) => t.id === activeId)
        if (activeTab && !activeTab.dirty && !activeTab.missing) {
          setTabs((prev) =>
            prev.map((t) => (t.id === activeId ? { ...t, dirty: true } : t))
          )
        }
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
              ? {
                  ...p,
                  selectedIndex: (p.selectedIndex - 1 + p.candidates.length) % p.candidates.length
                }
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
      popupKeymap,
      keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
      onUpdate,
      domHandlers,
      EditorView.theme({
        '&': { height: '100%', fontSize: '16px' },
        '.cm-scroller': {
          overflow: 'auto',
          fontFamily: '"Yu Gothic UI", "Meiryo", "Noto Sans JP", sans-serif',
          lineHeight: '1.8'
        },
        '.cm-content': {
          padding: '12px 16px',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          caretColor: '#333'
        },
        '.cm-gutters': { background: '#f8f8f8', borderRight: '1px solid #e0e0e0' },
        '.cm-activeLineGutter': { background: '#eef' },
        '.cm-activeLine': { background: '#f0f4ff' }
      }),
      EditorView.lineWrapping
    ]
    extensionsRef.current = sharedExtensions

    const initialTab: Tab = {
      id: newTabId(),
      filePath: null,
      editorState: EditorState.create({ doc: '', extensions: sharedExtensions }),
      dirty: false,
      missing: false,
      dictName: null
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
        if (!st.filePath) {
          restoredTabs.push({
            id: newTabId(), filePath: null,
            editorState: EditorState.create({ doc: '', extensions: sharedExtensions }),
            dirty: false, missing: false, dictName: st.dictName
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
              dirty: false, missing: false, dictName: st.dictName
            })
          } else {
            restoredTabs.push({
              id: newTabId(), filePath: st.filePath,
              editorState: EditorState.create({
                doc: '',
                extensions: [...sharedExtensions, EditorView.editable.of(false)]
              }),
              dirty: false, missing: true, dictName: st.dictName
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
      await window.api.dict.setActiveDict(activeTab.dictName)
      view.focus()
    })

    return () => view.destroy()
  }, [])

  // ── 描画 ──────────────────────────────────────────────────────────────

  const activeTab = tabs.find((t) => t.id === activeTabId)
  const activeDictName = activeTab?.dictName ?? null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', margin: 0 }}>
      {/* タブバー */}
      <div style={{
        display: 'flex', alignItems: 'stretch',
        background: '#e0e0e0', borderBottom: '1px solid #bbb',
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
                background: isActive ? '#fff' : 'transparent',
                borderRight: '1px solid #bbb',
                cursor: 'pointer', fontSize: 13,
                color: tab.missing ? '#b71c1c' : '#222',
                whiteSpace: 'nowrap',
                boxShadow: isActive ? 'inset 0 2px 0 #4a90d9' : 'none',
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
                  color: '#888', cursor: 'pointer', padding: '1px 3px',
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
            padding: '4px 12px', fontSize: 20, color: '#555',
            lineHeight: 1, alignSelf: 'center'
          }}
        >+</button>
      </div>

      {/* ツールバー：辞書選択 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        padding: '4px 12px', background: '#f5f5f5', borderBottom: '1px solid #ddd',
        fontSize: '13px', flexShrink: 0
      }}>
        <span>辞書:</span>
        <select
          value={activeDictName ?? ''}
          onChange={(e) => handleDictChange(e.target.value)}
          style={{ fontSize: '13px', padding: '2px 4px' }}
        >
          <option value="">（なし）</option>
          {dictList.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
          <option disabled>──────</option>
          <option value="__manage__">辞書を管理…</option>
        </select>
        <span style={{ color: '#aaa', fontSize: '12px' }}>Ctrl+D: 選択テキストを辞書に登録</span>
        <div style={{ marginLeft: 'auto' }}>
          <button
            onClick={() => setShowSettings(true)}
            title="設定 (Ctrl+,)"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 16, padding: '2px 6px', color: '#555', borderRadius: 3
            }}
          >⚙</button>
        </div>
      </div>

      {/* エディタ本体 */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        <div ref={editorRef} style={{ width: '100%', height: '100%' }} />

        {/* ファイルが見つからない場合のオーバーレイ */}
        {activeTab?.missing && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            background: '#fafafa', color: '#555'
          }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>⚠</div>
            <div style={{ fontWeight: 'bold', marginBottom: 8, color: '#b71c1c', fontSize: 15 }}>
              ファイルが見つかりませんでした
            </div>
            <div style={{ color: '#777', fontSize: 13, marginBottom: 6, maxWidth: 500, textAlign: 'center', wordBreak: 'break-all' }}>
              {activeTab.filePath}
            </div>
            <div style={{ color: '#aaa', fontSize: 12 }}>
              ファイルが移動または削除された可能性があります
            </div>
          </div>
        )}
      </div>

      {/* 変換候補ポップアップ */}
      {popup && (
        <CandidatePopup
          candidates={popup.candidates}
          selectedIndex={popup.selectedIndex}
          position={popup.position}
          onSelect={confirmCandidate}
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
    </div>
  )
}

export default App
