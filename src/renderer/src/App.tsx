import { useEffect, useRef, useCallback, useState } from 'react'
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { defaultKeymap, historyKeymap, history, indentWithTab } from '@codemirror/commands'
import { CandidatePopup } from './components/CandidatePopup'
import { InputModal } from './components/InputModal'
import { basename } from './utils/path'

const APP_NAME = 'コトバガエ'
const MAX_SEARCH_LEN = 10

function buildTitle(filePath: string | null, dirty: boolean): string {
  const name = filePath ? basename(filePath) : '無題'
  return `${APP_NAME} — ${name}${dirty ? ' *' : ''}`
}

interface PopupState {
  candidates: string[]
  reading: string
  selectedIndex: number
  position: { top: number; left: number }
}

function App(): JSX.Element {
  const editorRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const filePathRef = useRef<string | null>(null)
  const dirtyRef = useRef(false)
  const isComposingRef = useRef(false)

  const [popup, setPopup] = useState<PopupState | null>(null)
  const [activeDictName, setActiveDictName] = useState<string | null>(null)
  const [dictList, setDictList] = useState<string[]>([])

  // モーダル管理
  const [modal, setModal] = useState<{
    message: string
    defaultValue?: string
    onOk: (val: string) => void
  } | null>(null)

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

  const popupRef = useRef<PopupState | null>(null)
  popupRef.current = popup

  // ── タイトル更新 ─────────────────────────────────────────────

  const updateTitle = useCallback(() => {
    window.api.setTitle(buildTitle(filePathRef.current, dirtyRef.current))
  }, [])

  // ── 辞書初期化 ───────────────────────────────────────────────

  useEffect(() => {
    window.api.dict.listDicts().then((list) => {
      setDictList(list)
    })
    window.api.dict.getActiveDict().then((name) => {
      setActiveDictName(name)
    })
  }, [])

  // ── 候補ポップアップ ─────────────────────────────────────────

  const closePopup = useCallback(() => setPopup(null), [])

  const calcPopupPos = useCallback(
    (view: EditorView): { top: number; left: number } => {
      const pos = view.state.selection.main.head
      const coords = view.coordsAtPos(pos)
      if (!coords) return { top: 0, left: 0 }

      const POPUP_H = 320
      const POPUP_W = 180
      const viewRect = view.dom.getBoundingClientRect()

      let top = coords.bottom + 2
      let left = coords.left

      // 下にはみ出す場合はカーソル上方に表示
      if (top + POPUP_H > window.innerHeight - 8) {
        top = coords.top - POPUP_H - 2
      }
      // 右にはみ出す場合は左へシフト
      if (left + POPUP_W > viewRect.right - 4) {
        left = Math.max(viewRect.left + 4, viewRect.right - POPUP_W - 4)
      }

      return { top, left }
    },
    []
  )

  const triggerSearch = useCallback(async (view: EditorView) => {
    if (isComposingRef.current) return
    const pos = view.state.selection.main.head
    const textBefore = view.state.doc.sliceString(Math.max(0, pos - MAX_SEARCH_LEN), pos)
    const result = await window.api.dict.getCandidates(textBefore)
    if (!result) {
      closePopup()
      return
    }
    setPopup({
      candidates: result.candidates,
      reading: result.reading,
      selectedIndex: 0,
      position: calcPopupPos(view)
    })
  }, [closePopup, calcPopupPos])

  // ── ポップアップ確定 ─────────────────────────────────────────

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

  // ── ファイル操作 ─────────────────────────────────────────────

  const setContent = useCallback((text: string) => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } })
    view.dispatch({ selection: { anchor: 0 } })
    view.scrollDOM.scrollTop = 0
  }, [])

  const handleNew = useCallback(() => {
    filePathRef.current = null
    dirtyRef.current = false
    setContent('')
    closePopup()
    updateTitle()
    viewRef.current?.focus()
  }, [setContent, closePopup, updateTitle])

  const handleOpen = useCallback(async () => {
    const result = await window.api.openFile()
    if (!result) return
    filePathRef.current = result.path
    dirtyRef.current = false
    setContent(result.content)
    closePopup()
    updateTitle()
    viewRef.current?.focus()
  }, [setContent, closePopup, updateTitle])

  const handleSave = useCallback(async () => {
    const view = viewRef.current
    if (!view) return
    const content = view.state.doc.toString()
    if (!filePathRef.current) {
      const result = await window.api.saveFileAs(content)
      if (!result || !result.success) return
      filePathRef.current = result.path
    } else {
      const result = await window.api.saveFile(filePathRef.current, content)
      if (!result.success) return
    }
    dirtyRef.current = false
    updateTitle()
  }, [updateTitle])

  const handleSaveAs = useCallback(async () => {
    const view = viewRef.current
    if (!view) return
    const result = await window.api.saveFileAs(view.state.doc.toString())
    if (!result || !result.success) return
    filePathRef.current = result.path
    dirtyRef.current = false
    updateTitle()
  }, [updateTitle])

  // ── 簡易登録（Ctrl+D）────────────────────────────────────────

  const handleQuickRegister = useCallback(async () => {
    const view = viewRef.current
    if (!view) return
    const { from, to } = view.state.selection.main
    if (from === to) return // 未選択なら何もしない

    const selectedText = view.state.doc.sliceString(from, to)
    let targetDict = activeDictName

    if (!targetDict) {
      const newName = await showInput('登録先の辞書がありません。辞書名を入力してください:')
      if (!newName) { view.focus(); return }
      const ok = await window.api.dict.createDict(newName)
      if (!ok) { view.focus(); return }
      setDictList((prev) => [...prev, newName].sort())
      setActiveDictName(newName)
      await window.api.dict.setActiveDict(newName)
      targetDict = newName
    }

    const reading = await showInput(`「${selectedText}」の読みを入力してください:`)
    if (!reading) { view.focus(); return }
    await window.api.dict.addEntry(reading, [selectedText])
    view.focus()
  }, [activeDictName, showInput])

  // ── メニューイベント ─────────────────────────────────────────

  useEffect(() => {
    const off1 = window.api.onMenuNew(handleNew)
    const off2 = window.api.onMenuOpen(handleOpen)
    const off3 = window.api.onMenuSave(handleSave)
    const off4 = window.api.onMenuSaveAs(handleSaveAs)
    return () => { off1(); off2(); off3(); off4() }
  }, [handleNew, handleOpen, handleSave, handleSaveAs])

  // ── CodeMirror 初期化 ────────────────────────────────────────

  useEffect(() => {
    if (!editorRef.current) return

    const onUpdate = EditorView.updateListener.of((update) => {
      if (update.docChanged && !dirtyRef.current) {
        dirtyRef.current = true
        updateTitle()
      }
    })

    const popupKeymap = keymap.of([
      {
        key: 'ArrowDown',
        run: () => {
          if (!popupRef.current) return false
          setPopup((p) => p ? { ...p, selectedIndex: (p.selectedIndex + 1) % p.candidates.length } : null)
          return true
        }
      },
      {
        key: 'ArrowUp',
        run: () => {
          if (!popupRef.current) return false
          setPopup((p) => p ? { ...p, selectedIndex: (p.selectedIndex - 1 + p.candidates.length) % p.candidates.length } : null)
          return true
        }
      },
      {
        key: 'Enter',
        run: () => {
          if (!popupRef.current) return false
          confirmCandidate(popupRef.current.selectedIndex)
          return true
        }
      },
      {
        key: 'Escape',
        run: () => {
          if (!popupRef.current) return false
          closePopup()
          return true
        }
      },
      {
        key: 'Mod-d',
        run: () => { handleQuickRegister(); return true }
      }
    ])

    const view = new EditorView({
      state: EditorState.create({
        doc: '',
        extensions: [
          history(),
          lineNumbers(),
          highlightActiveLine(),
          popupKeymap,
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          onUpdate,
          EditorView.domEventHandlers({
            compositionstart: () => { isComposingRef.current = true; return false },
            compositionend: (_e, view) => {
              isComposingRef.current = false
              // compositionend 直後は doc がまだ更新途中の場合があるので 1 tick 遅らせる
              setTimeout(() => triggerSearch(view), 0)
              return false
            },
            keyup: (e, view) => {
              // ポップアップ操作キーと IME 中はサーチをスキップ
              const skip = ['ArrowUp', 'ArrowDown', 'Enter', 'Escape', 'Tab']
              if (!isComposingRef.current && !skip.includes(e.key)) {
                triggerSearch(view)
              }
              return false
            }
          }),
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
      }),
      parent: editorRef.current
    })

    viewRef.current = view
    updateTitle()
    view.focus()

    return () => view.destroy()
  }, [updateTitle, triggerSearch, confirmCandidate, closePopup, handleQuickRegister])

  // ── 辞書切り替えUI ───────────────────────────────────────────

  const handleDictChange = useCallback(async (name: string) => {
    const newName = name === '' ? null : name
    setActiveDictName(newName)
    await window.api.dict.setActiveDict(newName)
    closePopup()
    viewRef.current?.focus()
  }, [closePopup])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', margin: 0 }}>
      {/* ツールバー：辞書選択 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        padding: '4px 12px', background: '#f0f0f0', borderBottom: '1px solid #ddd',
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
        </select>
        <span style={{ color: '#888', fontSize: '12px' }}>
          Ctrl+D: 選択テキストを辞書に登録
        </span>
      </div>

      {/* エディタ本体 */}
      <div ref={editorRef} style={{ flex: 1, overflow: 'hidden', position: 'relative' }} />

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
    </div>
  )
}

export default App
