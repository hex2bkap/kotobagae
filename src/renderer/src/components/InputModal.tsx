import { useEffect, useRef } from 'react'
import { Modal } from './Modal'

interface Props {
  message: string
  defaultValue?: string
  onOk: (value: string) => void
  onCancel: () => void
}

export function InputModal({ message, defaultValue = '', onOk, onCancel }: Props): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const handleOk = (): void => {
    const val = inputRef.current?.value.trim() ?? ''
    if (val) onOk(val)
  }

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    // Enter/Escape をエディタに漏らさない
    if (e.key === 'Enter' || e.key === 'Escape') e.stopPropagation()
    if (e.key === 'Enter') handleOk()
    // ESC は Modal シェルのウィンドウリスナーが処理する
  }

  return (
    <Modal title="入力" onClose={onCancel} width={340}>
      <p style={{ margin: '0 0 12px', fontSize: '14px', color: 'var(--kg-text-primary)' }}>{message}</p>
      <input
        ref={inputRef}
        defaultValue={defaultValue}
        onKeyDown={handleKeyDown}
        style={{
          width: '100%', boxSizing: 'border-box',
          fontSize: '14px', padding: '6px 8px',
          border: '1px solid var(--kg-border)', borderRadius: '4px',
          background: 'var(--kg-bg-secondary)', color: 'var(--kg-text-primary)'
        }}
      />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
        <button onClick={onCancel} style={{ padding: '5px 16px', fontSize: '13px', cursor: 'pointer', borderRadius: '4px', border: '1px solid var(--kg-border)', background: 'var(--kg-bg-secondary)', color: 'var(--kg-text-primary)' }}>
          キャンセル
        </button>
        <button
          onClick={handleOk}
          style={{ padding: '5px 16px', fontSize: '13px', background: 'var(--kg-accent)', color: 'var(--kg-bg-primary)', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
        >
          OK
        </button>
      </div>
    </Modal>
  )
}
