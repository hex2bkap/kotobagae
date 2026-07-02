import React, { useState, useEffect, useRef } from 'react'
import { Modal } from './Modal'

interface Props {
  selectedText: string
  activeDictNames: string[]
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

  return (
    <Modal title={`「${selectedText}」を辞書に登録`} onClose={onCancel} width={360}>
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
          <button style={{ ...btnStyle, fontSize: 12 }} onClick={() => setShowNewDict(true)}>新規作成</button>
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
            <button style={{ ...btnStyle, fontSize: 12 }} onClick={() => { setShowNewDict(false); setTargetDict(choices[0]) }}>既存から選ぶ</button>
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
          // ESC は Modal シェルのウィンドウリスナーが処理する
        }}
      />

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button style={btnStyle} onClick={onCancel}>キャンセル</button>
        <button
          style={{ ...btnStyle, background: 'var(--kg-accent)', color: '#fff', borderColor: 'var(--kg-accent)' }}
          onClick={handleOk}
          disabled={!effectiveDict || !reading.trim()}
        >登録</button>
      </div>
    </Modal>
  )
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
