import { useEffect, useRef, useState, useCallback } from 'react'
import { EditorView } from '@codemirror/view'
import {
  SearchQuery, setSearchQuery,
  findNext, findPrevious, replaceNext, replaceAll,
  openSearchPanel, closeSearchPanel
} from '@codemirror/search'

interface Props {
  viewRef: React.RefObject<EditorView | null>
  show: boolean
  showReplace: boolean
  onToggleReplace: () => void
  onClose: () => void
}

interface MatchInfo { total: number; current: number }

export function SearchPanel({ viewRef, show, showReplace, onToggleReplace, onClose }: Props): JSX.Element | null {
  const [query, setQuery] = useState('')
  const [replacement, setReplacement] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [matchInfo, setMatchInfo] = useState<MatchInfo>({ total: 0, current: 0 })
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

  // CodeMirrorのハイライトを更新 + マッチ件数を取得
  const updateSearchQuery = useCallback((q: string, cs: boolean) => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: q, caseSensitive: cs })) })
    // 次フレームでDOM確定後にカウント
    requestAnimationFrame(() => {
      const all = view.dom.querySelectorAll('.cm-searchMatch')
      const selected = view.dom.querySelector('.cm-searchMatch.cm-searchMatch-selected')
      const current = selected ? Array.from(all).indexOf(selected) + 1 : 0
      setMatchInfo({ total: all.length, current })
    })
  }, [viewRef])

  const handleQueryChange = useCallback((val: string) => {
    setQuery(val)
    updateSearchQuery(val, caseSensitive)
  }, [caseSensitive, updateSearchQuery])

  const handleCaseToggle = useCallback(() => {
    const next = !caseSensitive
    setCaseSensitive(next)
    updateSearchQuery(query, next)
  }, [caseSensitive, query, updateSearchQuery])

  const refreshMatchInfo = useCallback(() => {
    const view = viewRef.current
    if (!view) return
    requestAnimationFrame(() => {
      const all = view.dom.querySelectorAll('.cm-searchMatch')
      const selected = view.dom.querySelector('.cm-searchMatch.cm-searchMatch-selected')
      const current = selected ? Array.from(all).indexOf(selected) + 1 : 0
      setMatchInfo({ total: all.length, current })
    })
  }, [viewRef])

  const handleFindNext = useCallback(() => {
    const view = viewRef.current
    if (!view || !query) return
    findNext(view)
    refreshMatchInfo()
  }, [viewRef, query, refreshMatchInfo])

  const handleFindPrev = useCallback(() => {
    const view = viewRef.current
    if (!view || !query) return
    findPrevious(view)
    refreshMatchInfo()
  }, [viewRef, query, refreshMatchInfo])

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
    // @codemirror/search の replaceAll はアクティブな置換テキストを使う
    // 先にクエリを置換テキスト付きで設定してから実行
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
  const countText = hasQuery && matchInfo.total > 0
    ? `${matchInfo.current} / ${matchInfo.total}`
    : hasQuery && matchInfo.total === 0
      ? '一致なし'
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
        <span style={{ fontSize: 12, color: matchInfo.total === 0 && hasQuery ? '#c0392b' : 'var(--kg-text-muted)', minWidth: 52, textAlign: 'center' }}>
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
