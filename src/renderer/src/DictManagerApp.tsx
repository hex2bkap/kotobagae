import { useState, useEffect, useRef, useCallback } from 'react'
import { ConfirmModal } from './components/ConfirmModal'

// ── 型定義 ──────────────────────────────────────────────────────────────────

interface DictEntry {
  word: string
  memo: string
  count: number
}

type DictData = Record<string, DictEntry[]>
type SaveStatus = 'saved' | 'saving'

interface CtxMenuItem {
  label: string
  action: () => void
  danger?: boolean
}
interface CtxMenu {
  x: number
  y: number
  items: CtxMenuItem[]
}

// ── MemoInput：デバウンス付き自己完結メモ入力 ─────────────────────────────

function MemoInput({
  initialValue,
  onSave
}: {
  initialValue: string
  onSave: (v: string) => Promise<void>
}): JSX.Element {
  const [val, setVal] = useState(initialValue)
  const timer = useRef<NodeJS.Timeout | null>(null)

  const flush = useCallback(
    async (v: string) => {
      if (timer.current) { clearTimeout(timer.current); timer.current = null }
      await onSave(v)
    },
    [onSave]
  )

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value
    setVal(v)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => onSave(v), 500)
  }

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => flush(e.target.value)

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); flush(val) }
  }

  return (
    <input
      value={val}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      placeholder="メモ（任意）"
      style={{
        width: '100%',
        fontSize: 12,
        border: '1px solid #e0e0e0',
        borderRadius: 3,
        padding: '2px 6px',
        color: '#666',
        background: '#f9f9f9',
        boxSizing: 'border-box'
      }}
    />
  )
}

// ── InlineTextInput：ダブルクリック編集用インプット ───────────────────────

function InlineTextInput({
  initialValue,
  onCommit,
  onCancel,
  style
}: {
  initialValue: string
  onCommit: (v: string) => void
  onCancel: () => void
  style?: React.CSSProperties
}): JSX.Element {
  const [val, setVal] = useState(initialValue)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => { ref.current?.select() }, [])

  const commit = () => {
    const trimmed = val.trim()
    if (trimmed && trimmed !== initialValue) onCommit(trimmed)
    else onCancel()
  }

  return (
    <input
      ref={ref}
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); commit() }
        if (e.key === 'Escape') { e.preventDefault(); onCancel() }
      }}
      onClick={(e) => e.stopPropagation()}
      style={{
        fontSize: 13,
        border: '1px solid #4a90d9',
        borderRadius: 3,
        padding: '1px 6px',
        width: '100%',
        boxSizing: 'border-box',
        ...style
      }}
    />
  )
}

// ── スタイル定数 ─────────────────────────────────────────────────────────────

const PANE_HEADER: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  padding: '5px 8px',
  background: '#f0f0f0',
  borderBottom: '1px solid #ddd',
  flexShrink: 0
}

const PANE_BTN: React.CSSProperties = {
  fontSize: 12,
  padding: '2px 8px',
  border: '1px solid #ccc',
  borderRadius: 3,
  background: '#fff',
  cursor: 'pointer',
  color: '#333'
}

const PANE_BTN_DANGER: React.CSSProperties = {
  ...PANE_BTN,
  color: '#c00'
}

const LIST_ITEM_BASE: React.CSSProperties = {
  padding: '5px 10px',
  cursor: 'pointer',
  fontSize: 13,
  userSelect: 'none',
  display: 'flex',
  alignItems: 'center',
  gap: 4
}

// ── DictManagerApp ────────────────────────────────────────────────────────────

export function DictManagerApp(): JSX.Element {
  // ── State ──────────────────────────────────────────────────────────────────

  // Pane 1
  const [dicts, setDicts] = useState<string[]>([])
  const [selectedDict, setSelectedDict] = useState<string | null>(null)
  const [renamingDict, setRenamingDict] = useState<string | null>(null)
  const [showNewDict, setShowNewDict] = useState(false)
  const [newDictValue, setNewDictValue] = useState('')

  // Pane 2
  const [dictData, setDictData] = useState<DictData>({})
  const [filterText, setFilterText] = useState('')
  const [selectedReading, setSelectedReading] = useState<string | null>(null)
  const [renamingReading, setRenamingReading] = useState<string | null>(null)
  const [showAddReading, setShowAddReading] = useState(false)
  const [addReadingVal, setAddReadingVal] = useState('')
  const [addCandVal, setAddCandVal] = useState('')

  // Pane 3
  const [showAddCandidate, setShowAddCandidate] = useState(false)
  const [addCandidateVal, setAddCandidateVal] = useState('')
  const [editingWordIdx, setEditingWordIdx] = useState<number | null>(null)

  // 共通
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved')
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null)
  const [confirmState, setConfirmState] = useState<{
    message: string
    onOk: () => void
    onCancel: () => void
  } | null>(null)

  // Refs
  const newDictInputRef = useRef<HTMLInputElement>(null)
  const addReadingRef = useRef<HTMLInputElement>(null)
  const addCandRef = useRef<HTMLInputElement>(null)
  const addCandidateRef = useRef<HTMLInputElement>(null)

  // ── ヘルパー ──────────────────────────────────────────────────────────────

  const showConfirm = useCallback((message: string): Promise<boolean> =>
    new Promise((resolve) => {
      setConfirmState({
        message,
        onOk: () => { setConfirmState(null); resolve(true) },
        onCancel: () => { setConfirmState(null); resolve(false) }
      })
    }), [])

  const withSave = useCallback(async (fn: () => Promise<unknown>): Promise<void> => {
    setSaveStatus('saving')
    await fn()
    // 最小表示時間を設けて「保存中…」が見えるようにする
    setTimeout(() => setSaveStatus('saved'), 700)
  }, [])

  const reloadDictData = useCallback(async (name: string, keepReading?: string | null) => {
    const data = await window.api.dict.getDictData(name)
    setDictData(data as DictData)
    // 読みが消えていたら選択解除
    setSelectedReading((prev) => {
      const keep = keepReading !== undefined ? keepReading : prev
      return keep && (data as DictData)[keep] ? keep : null
    })
  }, [])

  const notifyMain = useCallback(() => {
    window.api.dict.notifyListUpdated()
  }, [])

  // ── 初期ロード ────────────────────────────────────────────────────────────

  useEffect(() => {
    Promise.all([window.api.dict.listDicts(), window.api.dict.getActiveDict()]).then(
      async ([list, active]) => {
        setDicts(list)
        const initial = active && list.includes(active) ? active : list[0] ?? null
        if (initial) {
          setSelectedDict(initial)
          await reloadDictData(initial)
        }
      }
    )
  }, [reloadDictData])

  // コンテキストメニューを外クリックで閉じる
  useEffect(() => {
    const close = () => setCtxMenu(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [])

  // showNewDict が true になったらフォーカス
  useEffect(() => {
    if (showNewDict) setTimeout(() => newDictInputRef.current?.focus(), 0)
  }, [showNewDict])

  // showAddReading が true になったらフォーカス
  useEffect(() => {
    if (showAddReading) setTimeout(() => addReadingRef.current?.focus(), 0)
  }, [showAddReading])

  // showAddCandidate が true になったらフォーカス
  useEffect(() => {
    if (showAddCandidate) setTimeout(() => addCandidateRef.current?.focus(), 0)
  }, [showAddCandidate])

  // ── Pane 1：辞書セット操作 ────────────────────────────────────────────────

  const selectDict = useCallback(async (name: string) => {
    setSelectedDict(name)
    setFilterText('')
    setShowAddReading(false)
    setShowAddCandidate(false)
    setEditingWordIdx(null)
    await reloadDictData(name)
  }, [reloadDictData])

  const handleCreateDict = async () => {
    const name = newDictValue.trim()
    if (!name || dicts.includes(name)) return
    await withSave(async () => {
      const ok = await window.api.dict.createDict(name)
      if (ok) {
        const list = [...dicts, name].sort()
        setDicts(list)
        notifyMain()
        await selectDict(name)
      }
    })
    setNewDictValue('')
    setShowNewDict(false)
  }

  const handleCopyDict = async () => {
    if (!selectedDict) return
    let name = `${selectedDict}_コピー`
    if (dicts.includes(name)) {
      let i = 2
      while (dicts.includes(`${name}${i}`)) i++
      name = `${name}${i}`
    }
    await withSave(async () => {
      const ok = await window.api.dict.copyDict(selectedDict, name)
      if (ok) {
        setDicts((prev) => [...prev, name].sort())
        notifyMain()
      }
    })
  }

  const commitRenameDict = useCallback(async (oldName: string, newName: string) => {
    setRenamingDict(null)
    if (!newName || newName === oldName || dicts.includes(newName)) return
    await withSave(async () => {
      const ok = await window.api.dict.renameDict(oldName, newName)
      if (ok) {
        setDicts((prev) => prev.map((d) => (d === oldName ? newName : d)).sort())
        if (selectedDict === oldName) setSelectedDict(newName)
        notifyMain()
      }
    })
  }, [dicts, selectedDict, withSave, notifyMain])

  const handleDeleteDict = useCallback(async (name: string) => {
    const ok = await showConfirm(`辞書「${name}」を削除しますか？\nこの操作は元に戻せません。`)
    if (!ok) return
    await withSave(async () => {
      await window.api.dict.deleteDict(name)
      const list = dicts.filter((d) => d !== name)
      setDicts(list)
      notifyMain()
      if (selectedDict === name) {
        const next = list[0] ?? null
        setSelectedDict(next)
        if (next) await reloadDictData(next)
        else { setDictData({}); setSelectedReading(null) }
      }
    })
  }, [dicts, selectedDict, showConfirm, withSave, notifyMain, reloadDictData])

  const openCtxDict = useCallback((e: React.MouseEvent, name: string) => {
    e.preventDefault()
    e.stopPropagation()
    setCtxMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: '名前変更', action: () => setRenamingDict(name) },
        { label: '複製', action: () => { setSelectedDict(name); handleCopyDict() } },
        { label: '削除', action: () => handleDeleteDict(name), danger: true }
      ]
    })
  }, [handleCopyDict, handleDeleteDict])

  // ── Pane 2：読み操作 ──────────────────────────────────────────────────────

  const filteredReadings = Object.keys(dictData)
    .filter((r) => !filterText || r.includes(filterText))
    .sort()

  const handleAddReading = async () => {
    if (!selectedDict || !addReadingVal.trim()) return
    const reading = addReadingVal.trim()
    // 読点・カンマ・全角カンマ区切りで候補を分割
    const words = addCandVal.split(/[、,，]/).map((w) => w.trim()).filter(Boolean)
    if (!words.length) return
    await withSave(async () => {
      // dict.addEntry は activeDictName（グローバル）を使うため、
      // dict.addCandidate（dictName を明示）を使う
      for (const word of words) {
        await window.api.dict.addCandidate(selectedDict, reading, word)
      }
      await reloadDictData(selectedDict, reading)
    })
    setAddReadingVal('')
    setAddCandVal('')
    // フォーカスを読み入力欄に戻して連続追加
    setTimeout(() => addReadingRef.current?.focus(), 0)
  }

  const commitRenameReading = useCallback(async (oldR: string, newR: string) => {
    setRenamingReading(null)
    if (!newR || newR === oldR || !selectedDict) return
    await withSave(async () => {
      const ok = await window.api.dict.renameReading(selectedDict, oldR, newR)
      if (ok) {
        await reloadDictData(selectedDict, newR)
        setSelectedReading(newR)
      }
    })
  }, [selectedDict, withSave, reloadDictData])

  const handleDeleteReading = useCallback(async (reading: string) => {
    if (!selectedDict) return
    const ok = await showConfirm(`読み「${reading}」とその候補をすべて削除しますか？`)
    if (!ok) return
    await withSave(async () => {
      await window.api.dict.removeReading(selectedDict, reading)
      await reloadDictData(selectedDict, null)
    })
  }, [selectedDict, showConfirm, withSave, reloadDictData])

  const openCtxReading = useCallback((e: React.MouseEvent, reading: string) => {
    e.preventDefault()
    e.stopPropagation()
    setCtxMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: '名前変更', action: () => setRenamingReading(reading) },
        { label: '削除', action: () => handleDeleteReading(reading), danger: true }
      ]
    })
  }, [handleDeleteReading])

  // ── Pane 3：候補操作 ──────────────────────────────────────────────────────

  const candidates: DictEntry[] = selectedReading ? (dictData[selectedReading] ?? []) : []

  const handleAddCandidate = async () => {
    if (!selectedDict || !selectedReading || !addCandidateVal.trim()) return
    const word = addCandidateVal.trim()
    await withSave(async () => {
      await window.api.dict.addCandidate(selectedDict, selectedReading, word)
      await reloadDictData(selectedDict, selectedReading)
    })
    setAddCandidateVal('')
    setTimeout(() => addCandidateRef.current?.focus(), 0)
  }

  const handleUpdateWord = useCallback(async (index: number, newWord: string) => {
    setEditingWordIdx(null)
    if (!selectedDict || !selectedReading || !newWord.trim()) return
    await withSave(async () => {
      await window.api.dict.updateEntry(selectedDict, selectedReading, index, { word: newWord.trim() })
      await reloadDictData(selectedDict, selectedReading)
    })
  }, [selectedDict, selectedReading, withSave, reloadDictData])

  const handleUpdateMemo = useCallback(async (index: number, memo: string) => {
    if (!selectedDict || !selectedReading) return
    await withSave(async () => {
      await window.api.dict.updateEntry(selectedDict, selectedReading, index, { memo })
      await reloadDictData(selectedDict, selectedReading)
    })
  }, [selectedDict, selectedReading, withSave, reloadDictData])

  const handleDeleteCandidate = useCallback(async (index: number) => {
    if (!selectedDict || !selectedReading) return
    const word = candidates[index]?.word ?? ''
    const ok = await showConfirm(`候補「${word}」を削除しますか？`)
    if (!ok) return
    await withSave(async () => {
      await window.api.dict.removeCandidate(selectedDict, selectedReading, index)
      await reloadDictData(selectedDict, selectedReading)
    })
  }, [selectedDict, selectedReading, candidates, showConfirm, withSave, reloadDictData])

  const openCtxCandidate = useCallback((e: React.MouseEvent, index: number) => {
    e.preventDefault()
    e.stopPropagation()
    setCtxMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: '削除', action: () => handleDeleteCandidate(index), danger: true }
      ]
    })
  }, [handleDeleteCandidate])

  // ── TSV ────────────────────────────────────────────────────────────────────

  const handleExportTsv = async () => {
    if (!selectedDict) return
    const result = await window.api.dict.exportTsv(selectedDict)
    if (result.success) setSaveStatus('saved')
  }

  const handleImportTsv = async () => {
    if (!selectedDict) return
    const result = await window.api.dict.importTsv(selectedDict)
    if (result.success && result.count > 0) {
      await reloadDictData(selectedDict, selectedReading)
    }
  }

  // ── 描画 ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: '"Yu Gothic UI", "Meiryo", sans-serif', fontSize: 13, color: '#222', overflow: 'hidden' }}>

      {/* ── 3ペイン エリア ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', borderBottom: '1px solid #ccc' }}>

        {/* ── Pane 1：辞書セット ── */}
        <div style={{ width: '20%', display: 'flex', flexDirection: 'column', borderRight: '1px solid #ccc', background: '#fafafa' }}>
          <div style={PANE_HEADER}>
            <span style={{ fontWeight: 600, fontSize: 12, color: '#555', marginRight: 'auto' }}>辞書セット</span>
            <button style={PANE_BTN} title="新規" onClick={() => { setShowNewDict(true); setRenamingDict(null) }}>新規</button>
            <button style={PANE_BTN} title="複製" disabled={!selectedDict} onClick={handleCopyDict}>複製</button>
            <button style={PANE_BTN} title="名前変更" disabled={!selectedDict} onClick={() => selectedDict && setRenamingDict(selectedDict)}>改名</button>
            <button style={PANE_BTN_DANGER} title="削除" disabled={!selectedDict} onClick={() => selectedDict && handleDeleteDict(selectedDict)}>削除</button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {dicts.map((name) => {
              const isSelected = name === selectedDict
              return (
                <div
                  key={name}
                  onClick={() => selectDict(name)}
                  onDoubleClick={() => setRenamingDict(name)}
                  onContextMenu={(e) => openCtxDict(e, name)}
                  style={{
                    ...LIST_ITEM_BASE,
                    background: isSelected ? '#e3eefa' : 'transparent',
                    fontWeight: isSelected ? 600 : 400,
                    borderLeft: isSelected ? '3px solid #4a90d9' : '3px solid transparent'
                  }}
                >
                  {renamingDict === name ? (
                    <InlineTextInput
                      initialValue={name}
                      onCommit={(v) => commitRenameDict(name, v)}
                      onCancel={() => setRenamingDict(null)}
                    />
                  ) : (
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                  )}
                </div>
              )
            })}
            {/* 新規辞書インライン入力行 */}
            {showNewDict && (
              <div style={{ padding: '4px 8px', display: 'flex', gap: 4 }}>
                <input
                  ref={newDictInputRef}
                  value={newDictValue}
                  onChange={(e) => setNewDictValue(e.target.value)}
                  placeholder="辞書名"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); handleCreateDict() }
                    if (e.key === 'Escape') { setShowNewDict(false); setNewDictValue('') }
                  }}
                  style={{ flex: 1, fontSize: 13, padding: '2px 6px', border: '1px solid #4a90d9', borderRadius: 3 }}
                />
              </div>
            )}
            {showNewDict && (
              <div style={{ padding: '0 8px 4px', fontSize: 11, color: '#999' }}>Enter:追加 / Esc:終了</div>
            )}
          </div>
        </div>

        {/* ── Pane 2：読み ── */}
        <div style={{ width: '30%', display: 'flex', flexDirection: 'column', borderRight: '1px solid #ccc' }}>
          <div style={PANE_HEADER}>
            <span style={{ fontWeight: 600, fontSize: 12, color: '#555', marginRight: 'auto' }}>読み</span>
            <button
              style={PANE_BTN}
              disabled={!selectedDict}
              onClick={() => { setShowAddReading((v) => !v) }}
            >＋ 追加</button>
          </div>
          {/* 絞り込み */}
          <div style={{ padding: '4px 8px', borderBottom: '1px solid #eee', flexShrink: 0 }}>
            <input
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="絞り込み"
              style={{ width: '100%', fontSize: 12, padding: '2px 6px', border: '1px solid #ddd', borderRadius: 3, boxSizing: 'border-box' }}
            />
          </div>
          {/* インライン追加行 */}
          {showAddReading && (
            <div style={{ padding: '4px 8px', borderBottom: '1px solid #eee', background: '#f0f5ff', flexShrink: 0 }}>
              <div style={{ display: 'flex', gap: 4, marginBottom: 2 }}>
                <input
                  ref={addReadingRef}
                  value={addReadingVal}
                  onChange={(e) => setAddReadingVal(e.target.value)}
                  placeholder="読み"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); addCandRef.current?.focus() }
                    if (e.key === 'Escape') { setShowAddReading(false); setAddReadingVal(''); setAddCandVal('') }
                  }}
                  style={{ flex: 1, fontSize: 12, padding: '2px 6px', border: '1px solid #4a90d9', borderRadius: 3 }}
                />
                <input
                  ref={addCandRef}
                  value={addCandVal}
                  onChange={(e) => setAddCandVal(e.target.value)}
                  placeholder="変換候補（、区切り）"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); handleAddReading() }
                    if (e.key === 'Escape') { setShowAddReading(false); setAddReadingVal(''); setAddCandVal('') }
                  }}
                  style={{ flex: 2, fontSize: 12, padding: '2px 6px', border: '1px solid #4a90d9', borderRadius: 3 }}
                />
              </div>
              <div style={{ fontSize: 11, color: '#888' }}>Enter:追加 / Esc:終了</div>
            </div>
          )}
          {/* 読み一覧 */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {filteredReadings.map((reading) => {
              const isSelected = reading === selectedReading
              return (
                <div
                  key={reading}
                  onClick={() => { setSelectedReading(reading); setShowAddCandidate(false); setEditingWordIdx(null) }}
                  onDoubleClick={() => setRenamingReading(reading)}
                  onContextMenu={(e) => openCtxReading(e, reading)}
                  style={{
                    ...LIST_ITEM_BASE,
                    background: isSelected ? '#e3eefa' : 'transparent',
                    borderLeft: isSelected ? '3px solid #4a90d9' : '3px solid transparent',
                    justifyContent: 'space-between'
                  }}
                >
                  {renamingReading === reading ? (
                    <InlineTextInput
                      initialValue={reading}
                      onCommit={(v) => commitRenameReading(reading, v)}
                      onCancel={() => setRenamingReading(null)}
                    />
                  ) : (
                    <>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{reading}</span>
                      <span style={{ fontSize: 11, color: '#aaa', flexShrink: 0, marginLeft: 4 }}>
                        {dictData[reading]?.length ?? 0}件
                      </span>
                    </>
                  )}
                </div>
              )
            })}
            {selectedDict && filteredReadings.length === 0 && !filterText && (
              <div style={{ padding: '16px 10px', color: '#aaa', fontSize: 12 }}>
                読みがありません。<br />「＋ 追加」で登録できます。
              </div>
            )}
          </div>
        </div>

        {/* ── Pane 3：候補 ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={PANE_HEADER}>
            <span style={{ fontWeight: 600, fontSize: 12, color: '#555', marginRight: 'auto' }}>
              {selectedReading ? `「${selectedReading}」の候補` : '候補'}
            </span>
            <button
              style={PANE_BTN}
              disabled={!selectedReading}
              onClick={() => setShowAddCandidate((v) => !v)}
            >＋ 追加</button>
          </div>
          {/* インライン追加行 */}
          {showAddCandidate && selectedReading && (
            <div style={{ padding: '4px 8px', borderBottom: '1px solid #eee', background: '#f0f5ff', flexShrink: 0 }}>
              <div style={{ display: 'flex', gap: 4, marginBottom: 2 }}>
                <input
                  ref={addCandidateRef}
                  value={addCandidateVal}
                  onChange={(e) => setAddCandidateVal(e.target.value)}
                  placeholder="候補"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); handleAddCandidate() }
                    if (e.key === 'Escape') { setShowAddCandidate(false); setAddCandidateVal('') }
                  }}
                  style={{ flex: 1, fontSize: 13, padding: '3px 8px', border: '1px solid #4a90d9', borderRadius: 3 }}
                />
              </div>
              <div style={{ fontSize: 11, color: '#888' }}>Enter:追加 / Esc:終了</div>
            </div>
          )}
          {/* 候補一覧 */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {candidates.map((entry, idx) => (
              <div
                key={idx}
                onContextMenu={(e) => openCtxCandidate(e, idx)}
                style={{
                  border: '1px solid #ddd',
                  borderRadius: 5,
                  padding: '7px 10px',
                  background: '#fff',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4
                }}
              >
                {/* 単語行 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {editingWordIdx === idx ? (
                    <div style={{ flex: 1 }}>
                      <InlineTextInput
                        initialValue={entry.word}
                        onCommit={(v) => handleUpdateWord(idx, v)}
                        onCancel={() => setEditingWordIdx(null)}
                        style={{ fontWeight: 600, fontSize: 14 }}
                      />
                    </div>
                  ) : (
                    <span
                      onDoubleClick={() => setEditingWordIdx(idx)}
                      style={{ flex: 1, fontWeight: 600, fontSize: 14, cursor: 'default' }}
                      title="ダブルクリックで編集"
                    >
                      {entry.word}
                    </span>
                  )}
                  {/* 頻度バッジ（表示のみ・M5b で加算） */}
                  <span style={{
                    fontSize: 11, padding: '1px 6px',
                    background: entry.count > 0 ? '#e8f0fe' : '#f0f0f0',
                    color: entry.count > 0 ? '#1a56c4' : '#aaa',
                    borderRadius: 10, flexShrink: 0
                  }}>
                    {entry.count}回
                  </span>
                  <button
                    onClick={() => handleDeleteCandidate(idx)}
                    title="削除"
                    style={{ background: 'none', border: 'none', color: '#ccc', cursor: 'pointer', fontSize: 14, padding: '0 2px', lineHeight: 1 }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = '#e53e3e')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = '#ccc')}
                  >×</button>
                </div>
                {/* メモ行 */}
                <MemoInput
                  key={`${selectedReading}-${idx}-${entry.word}`}
                  initialValue={entry.memo}
                  onSave={async (memo) => handleUpdateMemo(idx, memo)}
                />
              </div>
            ))}
            {selectedReading && candidates.length === 0 && (
              <div style={{ color: '#aaa', fontSize: 12, paddingTop: 8 }}>
                候補がありません。「＋ 追加」で登録できます。
              </div>
            )}
            {!selectedReading && (
              <div style={{ color: '#bbb', fontSize: 12, paddingTop: 8 }}>
                左の「読み」から項目を選ぶと候補が表示されます。
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── フッター ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '5px 12px', background: '#f5f5f5', borderTop: '1px solid #ddd',
        fontSize: 12, flexShrink: 0
      }}>
        <button
          style={{ ...PANE_BTN, fontSize: 12 }}
          disabled={!selectedDict}
          onClick={handleImportTsv}
          title="TSV インポート（選択辞書対象）"
        >TSV インポート</button>
        <button
          style={{ ...PANE_BTN, fontSize: 12 }}
          disabled={!selectedDict}
          onClick={handleExportTsv}
          title="TSV エクスポート（選択辞書対象）"
        >TSV エクスポート</button>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, color: saveStatus === 'saving' ? '#888' : '#3a8a3a' }}>
          {saveStatus === 'saving' ? (
            <span>保存中…</span>
          ) : (
            <>
              <span>✓</span>
              <span>保存済み</span>
            </>
          )}
        </div>
      </div>

      {/* ── コンテキストメニュー ── */}
      {ctxMenu && (
        <div
          style={{
            position: 'fixed', left: ctxMenu.x, top: ctxMenu.y,
            background: '#fff', border: '1px solid #ccc', borderRadius: 4,
            boxShadow: '0 2px 8px rgba(0,0,0,0.18)', zIndex: 1000, minWidth: 130
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {ctxMenu.items.map((item, i) => (
            <div
              key={i}
              onClick={() => { item.action(); setCtxMenu(null) }}
              style={{
                padding: '6px 14px', cursor: 'pointer', fontSize: 13,
                color: item.danger ? '#c00' : '#222'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#f0f0f0')}
              onMouseLeave={(e) => (e.currentTarget.style.background = '')}
            >
              {item.label}
            </div>
          ))}
        </div>
      )}

      {/* ── 確認モーダル ── */}
      {confirmState && (
        <ConfirmModal
          message={confirmState.message}
          onOk={confirmState.onOk}
          onCancel={confirmState.onCancel}
        />
      )}
    </div>
  )
}
