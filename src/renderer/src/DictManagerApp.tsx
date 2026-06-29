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
      title={val}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      placeholder="メモ（任意）"
      style={{
        width: '100%',
        fontSize: 12,
        border: '1px solid var(--kg-border)',
        borderRadius: 3,
        padding: '2px 6px',
        color: 'var(--kg-text-secondary)',
        background: 'var(--kg-bg-secondary)',
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
        border: '1px solid var(--kg-accent)',
        borderRadius: 3,
        padding: '1px 6px',
        width: '100%',
        background: 'var(--kg-bg-primary)',
        color: 'var(--kg-text-primary)',
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
  background: 'var(--kg-bg-secondary)',
  borderBottom: '1px solid var(--kg-border)',
  flexShrink: 0
}

const PANE_BTN: React.CSSProperties = {
  fontSize: 12,
  padding: '2px 8px',
  border: '1px solid var(--kg-border)',
  borderRadius: 3,
  background: 'var(--kg-bg-primary)',
  cursor: 'pointer',
  color: 'var(--kg-text-primary)',
  flexShrink: 0,
  whiteSpace: 'nowrap'
}

const PANE_BTN_DANGER: React.CSSProperties = {
  ...PANE_BTN,
  color: 'var(--kg-accent)'
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

// ── ユーティリティ ────────────────────────────────────────────────────────────

function sortByPriorityLocal(names: string[], order: string[]): string[] {
  return names.slice().sort((a, b) => {
    const ia = order.indexOf(a)
    const ib = order.indexOf(b)
    const ra = ia === -1 ? Infinity : ia
    const rb = ib === -1 ? Infinity : ib
    return ra - rb
  })
}

// ── DictManagerApp ────────────────────────────────────────────────────────────

export function DictManagerApp(): JSX.Element {
  // ── State ──────────────────────────────────────────────────────────────────

  // Pane 1
  const [dicts, setDicts] = useState<string[]>([])
  const [_priorityOrder, setPriorityOrder] = useState<string[]>([])
  const [selectedDict, setSelectedDict] = useState<string | null>(null)
  const [renamingDict, setRenamingDict] = useState<string | null>(null)
  const [showNewDict, setShowNewDict] = useState(false)
  const [newDictValue, setNewDictValue] = useState('')
  const [defaultDictNames, setDefaultDictNames] = useState<string[]>([])

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
  const [showCount, setShowCount] = useState(false)
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
  const saveChainRef = useRef<Promise<void>>(Promise.resolve())

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
    const p = fn().then(() => undefined)
    saveChainRef.current = p
    await p
    setTimeout(() => setSaveStatus('saved'), 700)
  }, [])

  const toggleDefaultDict = useCallback(async (name: string, checked: boolean) => {
    const next = checked
      ? [...defaultDictNames, name]
      : defaultDictNames.filter((n) => n !== name)
    setDefaultDictNames(next)
    const current = await window.api.settings.load()
    await window.api.settings.save({ ...current, defaultDictNames: next })
  }, [defaultDictNames])

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

  const movePriority = useCallback(async (dictName: string, direction: -1 | 1) => {
    setPriorityOrder((prev) => {
      // 優先度に未登録の辞書は末尾に追加してから移動
      const allDicts = dicts
      const base = allDicts.reduce((acc, n) => {
        if (!acc.includes(n)) acc.push(n)
        return acc
      }, [...prev])
      const idx = base.indexOf(dictName)
      if (idx === -1) return prev
      const newIdx = idx + direction
      if (newIdx < 0 || newIdx >= base.length) return prev
      const next = [...base]
      ;[next[idx], next[newIdx]] = [next[newIdx], next[idx]]
      // 保存
      window.api.dict.setPriorityOrder(next)
      // メインウィンドウにも通知（優先度変更は listUpdated を使う）
      window.api.dict.notifyListUpdated()
      // dicts 表示を優先度順に更新
      setDicts(sortByPriorityLocal(dicts, next))
      return next
    })
  }, [dicts])

  // ── 初期ロード ────────────────────────────────────────────────────────────

  // テーマ同期：初回 + フォーカス時に最新テーマを適用
  useEffect(() => {
    const cleanup = window.api.dict.onFlushBeforeClose(async () => {
      document.activeElement instanceof HTMLElement && document.activeElement.blur()
      await new Promise<void>((r) => setTimeout(r, 0))
      await saveChainRef.current
      window.api.dict.flushDone()
    })
    return cleanup
  }, [])

  useEffect(() => {
    const applyTheme = async (): Promise<void> => {
      const s = await window.api.settings.load()
      document.documentElement.setAttribute('data-theme', s.display.theme)
    }
    applyTheme()
    window.addEventListener('focus', applyTheme)
    return () => window.removeEventListener('focus', applyTheme)
  }, [])

  useEffect(() => {
    Promise.all([
      window.api.dict.listDicts() as Promise<string[]>,
      window.api.dict.getActiveDicts() as Promise<string[]>,
      window.api.dict.getPriorityOrder() as Promise<string[]>,
      window.api.settings.load()
    ]).then(async ([list, activeDicts, order, s]) => {
      setShowCount(s.dictSort?.showCount ?? false)
      setDefaultDictNames(s.defaultDictNames ?? [])
      setPriorityOrder(order)
      // 優先度順にソートして表示
      const sorted = sortByPriorityLocal(list, order)
      setDicts(sorted)
      const initial = activeDicts[0] && list.includes(activeDicts[0])
        ? activeDicts[0]
        : list[0] ?? null
      if (initial) {
        setSelectedDict(initial)
        await reloadDictData(initial)
      }
    }).catch((err) => {
      // いずれかの IPC が reject した場合でも辞書リストだけは表示する
      console.error('[DictManager] 初期ロード失敗:', err)
      window.api.dict.listDicts().then((list) => {
        setDicts(list)
        if (list[0]) {
          setSelectedDict(list[0])
          reloadDictData(list[0])
        }
      }).catch((e) => console.error('[DictManager] listDicts も失敗:', e))
    })
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontSize: 13, color: 'var(--kg-text-primary)', overflow: 'hidden', background: 'var(--kg-bg-primary)' }}>

      {/* ── 3ペイン エリア ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', borderBottom: '1px solid var(--kg-border)' }}>

        {/* ── Pane 1：辞書セット ── */}
        <div style={{ width: 200, minWidth: 160, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--kg-border)', background: 'var(--kg-bg-secondary)' }}>
          <div style={{ ...PANE_HEADER, flexDirection: 'column', alignItems: 'flex-start', gap: 5 }}>
            <span style={{ fontWeight: 600, fontSize: 12, color: 'var(--kg-text-secondary)', whiteSpace: 'nowrap' }}>辞書セット</span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button style={PANE_BTN} title="新規" onClick={() => { setShowNewDict(true); setRenamingDict(null) }}>新規</button>
              <button style={PANE_BTN} title="複製" disabled={!selectedDict} onClick={handleCopyDict}>複製</button>
              <button style={PANE_BTN} title="名前変更" disabled={!selectedDict} onClick={() => selectedDict && setRenamingDict(selectedDict)}>改名</button>
              <button style={PANE_BTN_DANGER} title="削除" disabled={!selectedDict} onClick={() => selectedDict && handleDeleteDict(selectedDict)}>削除</button>
            </div>
          </div>
          {/* 優先度並べ替え（グローバル設定） */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', background: 'var(--kg-bg-tertiary)', borderBottom: '1px solid var(--kg-border)', flexShrink: 0 }}>
            <span style={{ fontSize: 11, color: 'var(--kg-text-secondary)', marginRight: 'auto' }}>優先度（↑が高い）</span>
            <button
              style={{ ...PANE_BTN, padding: '1px 6px' }}
              title="優先度を上げる"
              disabled={!selectedDict || dicts.indexOf(selectedDict) <= 0}
              onClick={() => selectedDict && movePriority(selectedDict, -1)}
            >↑</button>
            <button
              style={{ ...PANE_BTN, padding: '1px 6px' }}
              title="優先度を下げる"
              disabled={!selectedDict || dicts.indexOf(selectedDict) >= dicts.length - 1}
              onClick={() => selectedDict && movePriority(selectedDict, 1)}
            >↓</button>
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
                    background: isSelected ? 'var(--kg-accent-soft)' : 'transparent',
                    fontWeight: isSelected ? 600 : 400,
                    borderLeft: isSelected ? '3px solid var(--kg-accent)' : '3px solid transparent'
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
                  style={{ flex: 1, fontSize: 13, padding: '2px 6px', border: '1px solid var(--kg-accent)', borderRadius: 3, background: 'var(--kg-bg-primary)', color: 'var(--kg-text-primary)' }}
                />
              </div>
            )}
            {showNewDict && (
              <div style={{ padding: '0 8px 4px', fontSize: 11, color: 'var(--kg-text-muted)' }}>Enter:追加 / Esc:終了</div>
            )}
          </div>
          {/* 新規タブで開く辞書 */}
          {dicts.length > 0 && (
            <div style={{ borderTop: '1px solid var(--kg-border)', padding: '6px 8px 4px', flexShrink: 0, maxHeight: 160, display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: 11, color: 'var(--kg-text-secondary)', marginBottom: 4, fontWeight: 600, flexShrink: 0 }}>新規タブで開く辞書</div>
              <div style={{ overflowY: 'auto', flex: 1 }}>
              {dicts.map((name) => (
                <label key={name} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '2px 0', fontSize: 12, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={defaultDictNames.includes(name)}
                    onChange={(e) => toggleDefaultDict(name, e.target.checked)}
                  />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                </label>
              ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Pane 2：読み ── */}
        <div style={{ width: 240, minWidth: 180, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--kg-border)' }}>
          <div style={PANE_HEADER}>
            <span style={{ fontWeight: 600, fontSize: 12, color: 'var(--kg-text-secondary)', marginRight: 'auto' }}>読み</span>
            <button
              style={PANE_BTN}
              disabled={!selectedDict}
              onClick={() => { setShowAddReading((v) => !v) }}
            >＋ 追加</button>
          </div>
          {/* 絞り込み */}
          <div style={{ padding: '4px 8px', borderBottom: '1px solid var(--kg-border)', flexShrink: 0 }}>
            <input
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="絞り込み"
              style={{ width: '100%', fontSize: 12, padding: '2px 6px', border: '1px solid var(--kg-border)', borderRadius: 3, boxSizing: 'border-box', background: 'var(--kg-bg-secondary)', color: 'var(--kg-text-primary)' }}
            />
          </div>
          {/* インライン追加行 */}
          {showAddReading && (
            <div style={{ padding: '4px 8px', borderBottom: '1px solid var(--kg-border)', background: 'var(--kg-accent-soft)', flexShrink: 0 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 2 }}>
                <input
                  ref={addReadingRef}
                  value={addReadingVal}
                  onChange={(e) => setAddReadingVal(e.target.value)}
                  placeholder="読み"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); addCandRef.current?.focus() }
                    if (e.key === 'Escape') { setShowAddReading(false); setAddReadingVal(''); setAddCandVal('') }
                  }}
                  style={{ width: '100%', fontSize: 12, padding: '2px 6px', border: '1px solid var(--kg-accent)', borderRadius: 3, boxSizing: 'border-box', background: 'var(--kg-bg-primary)', color: 'var(--kg-text-primary)' }}
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
                  style={{ width: '100%', fontSize: 12, padding: '2px 6px', border: '1px solid var(--kg-accent)', borderRadius: 3, boxSizing: 'border-box', background: 'var(--kg-bg-primary)', color: 'var(--kg-text-primary)' }}
                />
              </div>
              <div style={{ fontSize: 11, color: 'var(--kg-text-muted)' }}>Enter:追加 / Esc:終了</div>
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
                    background: isSelected ? 'var(--kg-accent-soft)' : 'transparent',
                    borderLeft: isSelected ? '3px solid var(--kg-accent)' : '3px solid transparent',
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
                      <span style={{ fontSize: 11, color: 'var(--kg-text-muted)', flexShrink: 0, marginLeft: 4 }}>
                        {dictData[reading]?.length ?? 0}件
                      </span>
                    </>
                  )}
                </div>
              )
            })}
            {selectedDict && filteredReadings.length === 0 && !filterText && (
              <div style={{ padding: '16px 10px', color: 'var(--kg-text-muted)', fontSize: 12 }}>
                読みがありません。<br />「＋ 追加」で登録できます。
              </div>
            )}
          </div>
        </div>

        {/* ── Pane 3：候補 ── */}
        <div style={{ flex: 1, minWidth: 240, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={PANE_HEADER}>
            <span style={{ fontWeight: 600, fontSize: 12, color: 'var(--kg-text-secondary)', marginRight: 'auto', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
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
            <div style={{ padding: '4px 8px', borderBottom: '1px solid var(--kg-border)', background: 'var(--kg-accent-soft)', flexShrink: 0 }}>
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
                  style={{ flex: 1, fontSize: 13, padding: '3px 8px', border: '1px solid var(--kg-accent)', borderRadius: 3, background: 'var(--kg-bg-primary)', color: 'var(--kg-text-primary)' }}
                />
              </div>
              <div style={{ fontSize: 11, color: 'var(--kg-text-muted)' }}>Enter:追加 / Esc:終了</div>
            </div>
          )}
          {/* 候補一覧 */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {candidates.map((entry, idx) => (
              <div
                key={idx}
                onContextMenu={(e) => openCtxCandidate(e, idx)}
                style={{
                  border: '1px solid var(--kg-border)',
                  borderRadius: 5,
                  padding: '7px 10px',
                  background: 'var(--kg-bg-primary)',
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
                  {/* 頻度バッジ（B=オンのときのみ表示） */}
                  {showCount && (
                    <span style={{
                      fontSize: 11, padding: '1px 6px',
                      background: entry.count > 0 ? 'var(--kg-accent-soft)' : 'var(--kg-bg-tertiary)',
                      color: entry.count > 0 ? 'var(--kg-accent)' : 'var(--kg-text-muted)',
                      borderRadius: 10, flexShrink: 0
                    }}>
                      使用 {entry.count}回
                    </span>
                  )}
                  <button
                    onClick={() => handleDeleteCandidate(idx)}
                    title="削除"
                    style={{ background: 'none', border: 'none', color: 'var(--kg-text-muted)', cursor: 'pointer', fontSize: 14, padding: '0 2px', lineHeight: 1 }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--kg-accent)')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--kg-text-muted)')}
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
              <div style={{ color: 'var(--kg-text-muted)', fontSize: 12, paddingTop: 8 }}>
                候補がありません。「＋ 追加」で登録できます。
              </div>
            )}
            {!selectedReading && (
              <div style={{ color: 'var(--kg-text-muted)', fontSize: 12, paddingTop: 8 }}>
                左の「読み」から項目を選ぶと候補が表示されます。
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── フッター ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '5px 12px', background: 'var(--kg-bg-secondary)', borderTop: '1px solid var(--kg-border)',
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
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, color: saveStatus === 'saving' ? 'var(--kg-text-muted)' : 'var(--kg-text-secondary)' }}>
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
            background: 'var(--kg-bg-primary)', border: '1px solid var(--kg-border)', borderRadius: 4,
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
                color: item.danger ? 'var(--kg-accent)' : 'var(--kg-text-primary)'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--kg-bg-secondary)')}
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
