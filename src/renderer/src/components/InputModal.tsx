import { useEffect, useRef } from 'react'

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
    if (e.key === 'Enter') handleOk()
    if (e.key === 'Escape') onCancel()
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 99999,
        background: 'rgba(0,0,0,0.35)',
        display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div style={{
        background: '#fff', borderRadius: '6px', padding: '24px 28px',
        minWidth: '320px', boxShadow: '0 4px 24px rgba(0,0,0,0.2)',
        fontFamily: '"Yu Gothic UI", "Meiryo", sans-serif'
      }}>
        <p style={{ margin: '0 0 12px', fontSize: '14px' }}>{message}</p>
        <input
          ref={inputRef}
          defaultValue={defaultValue}
          onKeyDown={handleKeyDown}
          style={{
            width: '100%', boxSizing: 'border-box',
            fontSize: '14px', padding: '6px 8px',
            border: '1px solid #bbb', borderRadius: '4px'
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
          <button onClick={onCancel} style={{ padding: '5px 16px', fontSize: '13px' }}>
            キャンセル
          </button>
          <button
            onClick={handleOk}
            style={{
              padding: '5px 16px', fontSize: '13px',
              background: '#4a90d9', color: '#fff', border: 'none', borderRadius: '4px'
            }}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  )
}
