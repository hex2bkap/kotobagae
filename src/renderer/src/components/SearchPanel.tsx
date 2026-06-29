import { useEffect, useRef, useState, useCallback } from 'react'
import { EditorView } from '@codemirror/view'
import {
  SearchQuery, setSearchQuery,
  replaceNext, replaceAll,
  openSearchPanel, closeSearchPanel,
  SearchCursor
} from '@codemirror/search'

interface Props {
  viewRef: React.RefObject<EditorView | null>
  show: boolean
  showReplace: boolean
  onToggleReplace: () => void
  onClose: () => void
}

interface MatchInfo { total: number; current: number; capped: boolean }

export function SearchPanel({ viewRef, show, showReplace, onToggleReplace, onClose }: Props): JSX.Element | null {
  const [query, setQuery] = useState('')
  const [replacement, setReplacement] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [matchInfo, setMatchInfo] = useState<MatchInfo>({ total: 0, current: 0, capped: false })
  const searchInputRef = useRef<HTMLInputElement>(null)
  const replaceInputRef = useRef<HTMLInputElement>(null)

  // フォーカス管理：show が true になったときに検索入力へフォーカス
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    if (show) {
      // openSearchPanel でハイライト機構を有効化（内部パネルは noop で非表示）
      openSearchPanel(view)
      setTimeout(() => {
        searchInputRef.current?.focus()
        searchInputRef.current?.select()
      }, 0)
    } else {
      // 閉じるとき: ハイライト無効化してエディタへフォーカス戻す
      closeSearchPanel(view)
      view.focus()
    }
  }, [show, viewRef])

  // replace行が表示されたときに置換入力へフォーカス
  useEffect(() => {
    if (show && showReplace) {
      setTimeout(() => replaceInputRef.current?.focus(), 0)
    }
  }, [showReplace, show])

  // SearchCursor で全マッチを列挙し、現在選択に基づいて next/prev へ移動する自前ナビ
  // findNext/findPrevious の代わりに使用（CM の findPrevious が前に戻らないバグ回避）
  const navigateMatch = useCallback((q: string, cs: boolean, direction: 'next' | 'prev'): MatchInfo => {
    const view = viewRef.current
    if (!view || !q) return { total: 0, current: 0, capped: false }

    const normalize = cs ? undefined : (s: string) => s.toLowerCase()
    const { from: selFrom, to: selTo } = view.state.selection.main
    const cursor = new SearchCursor(view.state.doc, q, 0, undefined, normalize)

    const matches: { from: number; to: number }[] = []
    while (!cursor.next().done) {
      matches.push({ from: cursor.value.from, to: cursor.value.to })
      if (matches.length >= 1000) break
    }

    if (matches.length === 0) return { total: 0, current: 0, capped: false }

    const capped = matches.length >= 1000
    const currentIdx = matches.findIndex(m => m.from === selFrom && m.to === selTo)
    let nextIdx: number
    if (currentIdx === -1) {
      nextIdx = direction === 'next' ? 0 : matches.length - 1
    } else {
      nextIdx = direction === 'next'
        ? (currentIdx + 1) % matches.length
        : (currentIdx - 1 + matches.length) % matches.length
    }

    const target = matches[nextIdx]
    view.dispatch({ selection: { anchor: target.from, head: target.to }, scrollIntoView: true })

    return { total: matches.length, current: nextIdx + 1, capped }
  }, [viewRef])

  // クエリ変更時：CM の検索状態を更新し、最初のヒットへ自動移動（インクリメンタル検索）
  const updateSearchQuery = useCallback((q: string, cs: boolean) => {
    const view = viewRef.current
    if (!view) return

    view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: q, caseSensitive: cs })) })

    if (q) {
      setMatchInfo(navigateMatch(q, cs, 'next'))
    } else {
      setMatchInfo({ total: 0, current: 0, capped: false })
    }
  }, [viewRef, navigateMatch])

  const handleQueryChange = useCallback((val: string) => {
    setQuery(val)
    updateSearchQuery(val, caseSensitive)
  }, [caseSensitive, updateSearchQuery])

  const handleCaseToggle = useCallback(() => {
    const next = !caseSensitive
    setCaseSensitive(next)
    updateSearchQuery(query, next)
  }, [caseSensitive, query, updateSearchQuery])

  // 置換後に件数を再計算（移動なし）
  const refreshMatchInfo = useCallback(() => {
    const view = viewRef.current
    if (!view || !query) return
    const normalize = caseSensitive ? undefined : (s: string) => s.toLowerCase()
    const { from: selFrom, to: selTo } = view.state.selection.main
    const cursor = new SearchCursor(view.state.doc, query, 0, undefined, normalize)
    let total = 0; let current = 0; let capped = false
    while (!cursor.next().done) {
      total++
      if (cursor.value.from === selFrom && cursor.value.to === selTo) current = total
      if (total >= 1000) { capped = true; break }
    }
    setMatchInfo({ total, current, capped })
  }, [viewRef, query, caseSensitive])

  const handleFindNext = useCallback(() => {
    if (!query) return
    setMatchInfo(navigateMatch(query, caseSensitive, 'next'))
  }, [query, caseSensitive, navigateMatch])

  const handleFindPrev = useCallback(() => {
    if (!query) return
    setMatchInfo(navigateMatch(query, caseSensitive, 'prev'))
  }, [query, caseSensitive, navigateMatch])

  const handleReplaceNext = useCallback(() => {
    const view = viewRef.current
    if (!view || !query) return
    // 最新の replacement を SearchQuery にセットしてから置換
    view.dispatch({ effects: setSearchQuery.of(new SearchQuery({
      search: query, replace: replacement, caseSensitive
    })) })
    replaceNext(view)
    refreshMatchInfo()
  }, [viewRef, query, replacement, caseSensitive, refreshMatchInfo])

  const handleReplaceAll = useCallback(() => {
    const view = viewRef.current
    if (!view || !query) return
    view.dispatch({ effects: setSearchQuery.of(new SearchQuery({
      search: query, replace: replacement, caseSensitive
    })) })
    replaceAll(view)
    refreshMatchInfo()
  }, [viewRef, query, replacement, caseSensitive, refreshMatchInfo])

  // キーハンドリング（検索入力内）
  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (e.shiftKey) handleFindPrev()
      else handleFindNext()
    }
  }, [onClose, handleFindNext, handleFindPrev])

  const handleReplaceKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
    if (e.key === 'Enter') { e.preventDefault(); handleReplaceNext() }
  }, [onClose, handleReplaceNext])

  if (!show) return null

  const hasQuery = query.length > 0
  const countText = hasQuery
    ? matchInfo.total === 0
      ? '一致なし'
      : matchInfo.current > 0
        ? matchInfo.capped
          ? `${matchInfo.current} / 999+`
          : `${matchInfo.current} / ${matchInfo.total}`
        : matchInfo.capped ? '999+件' : `${matchInfo.total}件`
    : ''

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      background: 'var(--kg-bg-secondary)',
      borderBottom: '1px solid var(--kg-border)',
      padding: '4px 8px', gap: 4, flexShrink: 0
    }}>
      {/* 検索行 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <input
          ref={searchInputRef}
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          onKeyDown={handleSearchKeyDown}
          placeholder="検索"
          style={inputStyle}
        />
        <span style={{ fontSize: 12, color: matchInfo.total === 0 && hasQuery ? 'var(--kg-missing-text)' : 'var(--kg-text-muted)', minWidth: 52, textAlign: 'center' }}>
          {countText}
        </span>
        <button onClick={handleFindPrev} title="前へ (Shift+Enter)" disabled={!hasQuery} style={iconBtnStyle}>↑</button>
        <button onClick={handleFindNext} title="次へ (Enter)"      disabled={!hasQuery} style={iconBtnStyle}>↓</button>
        <button
          onClick={handleCaseToggle}
          title="大文字小文字を区別"
          style={{ ...iconBtnStyle, fontWeight: 'bold', background: caseSensitive ? 'var(--kg-accent)' : undefined, color: caseSensitive ? '#fff' : undefined }}
        >Aa</button>
        <button onClick={onToggleReplace} title="置換を表示/非表示" style={{ ...iconBtnStyle, fontSize: 11 }}>
          {showReplace ? '▲' : '▼'}置換
        </button>
        <button onClick={onClose} title="閉じる (Esc)" style={{ ...iconBtnStyle, marginLeft: 'auto' }}>×</button>
      </div>

      {/* 置換行 */}
      {showReplace && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input
            ref={replaceInputRef}
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
            onKeyDown={handleReplaceKeyDown}
            placeholder="置換"
            style={inputStyle}
          />
          <button onClick={handleReplaceNext} disabled={!hasQuery} style={actionBtnStyle}>置換</button>
          <button onClick={handleReplaceAll}  disabled={!hasQuery} style={actionBtnStyle}>すべて置換</button>
        </div>
      )}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  fontSize: 13, padding: '3px 6px',
  border: '1px solid var(--kg-border-strong)', borderRadius: 3,
  background: 'var(--kg-bg-primary)', color: 'var(--kg-text-primary)',
  width: 220, outline: 'none'
}

const iconBtnStyle: React.CSSProperties = {
  background: 'none', border: '1px solid var(--kg-border)', borderRadius: 3,
  cursor: 'pointer', padding: '2px 7px', fontSize: 13,
  color: 'var(--kg-text-secondary)'
}

const actionBtnStyle: React.CSSProperties = {
  background: 'none', border: '1px solid var(--kg-border)', borderRadius: 3,
  cursor: 'pointer', padding: '2px 10px', fontSize: 12,
  color: 'var(--kg-text-secondary)'
}
