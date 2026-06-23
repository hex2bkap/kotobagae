import { useState, useEffect, useRef } from 'react'

interface Props {
  selectedText: string
  // 有効辞書リスト（優先度順）。空なら全辞書リストを使う
  activeDictNames: string[]
  // 全辞書リスト（新規作成用）
  allDictNames: string[]
  onOk: (dictName: string, reading: string) => void
  onCancel: () => void
}

export function RegisterModal({
  selectedText,
  activeDictNames,
  allDictNames,
  onOk,
  onCancel
}: Props): JSX.Element {
  // 登録先の選択肢: 有効辞書 > 全辞書 の優先順で使う
  const choices = activeDictNames.length > 0 ? activeDictNames : allDictNames
  const [targetDict, setTargetDict] = useState(choices[0] ?? '')
  const [reading, setReading] = useState('')
  const [newDictName, setNewDictName] = useState('')
  const [showNewDict, setShowNewDict] = useState(choices.length === 0)
  const readingRef = useRef<HTMLInputElement>(null)

  useEffect(() => { readingRef.current?.focus() }, [])

  const effectiveDict = showNewDict ? newDictName.trim() : targetDict

  const handleOk = () => {
    if (!effectiveDict || !reading.trim()) return
    onOk(effectiveDict, reading.trim())
  }

  const overlayStyle: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000
  }
  const boxStyle: React.CSSProperties = {
    background: 'var(--kg-bg-primary)', border: '1px solid var(--kg-border-strong)',
    borderRadius: 6, padding: '20px 24px', minWidth: 320,
    boxShadow: '0 4px 16px rgba(0,0,0,0.3)', color: 'var(--kg-text-primary)'
  }
  const labelStyle: React.CSSProperties = { fontSize: 12, color: 'var(--kg-text-secondary)', marginBottom: 4, display: 'block' }
  const inputStyle: React.CSSProperties = {
    width: '100%', fontSize: 14, padding: '5px 8px', boxSizing: 'border-box',
    border: '1px solid var(--kg-border-strong)', borderRadius: 3,
    background: 'var(--kg-bg-primary)', color: 'var(--kg-text-primary)'
  }
  const btnStyle: React.CSSProperties = {
    padding: '5px 16px', fontSize: 13, borderRadius: 4, border: '1px solid var(--kg-border-strong)',
    cursor: 'pointer', background: 'var(--kg-bg-secondary)', color: 'var(--kg-text-primary)'
  }

  return (
    <div style={overlayStyle} onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel() }}>
      <div style={boxStyle} onKeyDown={(e) => { if (e.key === 'Escape') onCancel() }}>
        <div style={{ fontWeight: 'bold', marginBottom: 14, fontSize: 14 }}>
          「{selectedText}」を辞書に登録
        </div>

        {/* 登録先辞書 */}
        <label style={labelStyle}>登録先の辞書</label>
        {!showNewDict ? (
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            <select
              value={targetDict}
              onChange={(e) => setTargetDict(e.target.value)}
              style={{ ...inputStyle, flex: 1 }}
            >
              {choices.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <button
              style={{ ...btnStyle, fontSize: 12 }}
              onClick={() => setShowNewDict(true)}
            >新規作成</button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            <input
              value={newDictName}
              onChange={(e) => setNewDictName(e.target.value)}
              placeholder="新しい辞書名"
              style={{ ...inputStyle, flex: 1 }}
            />
            {choices.length > 0 && (
              <button
                style={{ ...btnStyle, fontSize: 12 }}
                onClick={() => { setShowNewDict(false); setTargetDict(choices[0]) }}
              >既存から選ぶ</button>
            )}
          </div>
        )}

        {/* 読み */}
        <label style={labelStyle}>読み（変換するときに入力するひらがな）</label>
        <input
          ref={readingRef}
          value={reading}
          onChange={(e) => setReading(e.target.value)}
          placeholder="例: ろざん"
          style={{ ...inputStyle, marginBottom: 18 }}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter') handleOk()
            if (e.key === 'Escape') onCancel()
          }}
        />

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button style={btnStyle} onClick={onCancel}>キャンセル</button>
          <button
            style={{ ...btnStyle, background: '#4a90d9', color: '#fff', borderColor: '#357abd' }}
            onClick={handleOk}
            disabled={!effectiveDict || !reading.trim()}
          >登録</button>
        </div>
      </div>
    </div>
  )
}
