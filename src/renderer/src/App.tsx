import { useEffect, useRef, useCallback } from 'react'
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { defaultKeymap, historyKeymap, history, indentWithTab } from '@codemirror/commands'
import { basename } from './utils/path'

const APP_NAME = 'コトバガエ'

function buildTitle(filePath: string | null, dirty: boolean): string {
  const name = filePath ? basename(filePath) : '無題'
  return `${APP_NAME} — ${name}${dirty ? ' *' : ''}`
}

function App(): JSX.Element {
  const editorRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const filePathRef = useRef<string | null>(null)
  const dirtyRef = useRef(false)

  const updateTitle = useCallback(() => {
    window.api.setTitle(buildTitle(filePathRef.current, dirtyRef.current))
  }, [])

  const setContent = useCallback((text: string) => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: text }
    })
    // カーソルを先頭へ
    view.dispatch({ selection: { anchor: 0 } })
    view.scrollDOM.scrollTop = 0
  }, [])

  const handleNew = useCallback(() => {
    filePathRef.current = null
    dirtyRef.current = false
    setContent('')
    updateTitle()
    viewRef.current?.focus()
  }, [setContent, updateTitle])

  const handleOpen = useCallback(async () => {
    const result = await window.api.openFile()
    if (!result) return
    filePathRef.current = result.path
    dirtyRef.current = false
    setContent(result.content)
    updateTitle()
    viewRef.current?.focus()
  }, [setContent, updateTitle])

  const handleSave = useCallback(async () => {
    const view = viewRef.current
    if (!view) return
    const content = view.state.doc.toString()
    if (!filePathRef.current) {
      // パスがない場合は別名で保存へ
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

  // メニューイベントの登録
  useEffect(() => {
    const off1 = window.api.onMenuNew(handleNew)
    const off2 = window.api.onMenuOpen(handleOpen)
    const off3 = window.api.onMenuSave(handleSave)
    const off4 = window.api.onMenuSaveAs(handleSaveAs)
    return () => { off1(); off2(); off3(); off4() }
  }, [handleNew, handleOpen, handleSave, handleSaveAs])

  // CodeMirror 初期化
  useEffect(() => {
    if (!editorRef.current) return

    const onUpdate = EditorView.updateListener.of((update) => {
      if (update.docChanged && !dirtyRef.current) {
        dirtyRef.current = true
        updateTitle()
      }
    })

    const view = new EditorView({
      state: EditorState.create({
        doc: '',
        extensions: [
          history(),
          lineNumbers(),
          highlightActiveLine(),
          keymap.of([
            ...defaultKeymap,
            ...historyKeymap,
            indentWithTab
          ]),
          onUpdate,
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
  }, [updateTitle])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', margin: 0 }}>
      <div ref={editorRef} style={{ flex: 1, overflow: 'hidden' }} />
    </div>
  )
}

export default App
