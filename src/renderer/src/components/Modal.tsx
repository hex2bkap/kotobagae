import React, { useEffect } from 'react'

interface Props {
  title: string
  onClose: () => void
  children: React.ReactNode
  width?: number
}

export function Modal({ title, onClose, children, width = 480 }: Props): JSX.Element {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={{ ...containerStyle, width }} onClick={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <span style={headerTitleStyle}>{title}</span>
          <button className="modal-close-btn" onClick={onClose} style={closeBtnStyle} aria-label="閉じる">
            ×
          </button>
        </div>
        <div style={bodyStyle}>
          {children}
        </div>
      </div>
    </div>
  )
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 500,
  background: 'rgba(0,0,0,0.4)',
  display: 'flex', alignItems: 'center', justifyContent: 'center'
}
const containerStyle: React.CSSProperties = {
  background: 'var(--kg-bg-primary)',
  border: '1px solid var(--kg-border-strong)',
  borderRadius: 10,
  overflow: 'hidden',
  boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
  display: 'flex',
  flexDirection: 'column',
  maxHeight: '85vh'
}
const headerStyle: React.CSSProperties = {
  background: 'var(--kg-titlebar-bg)',
  color: 'var(--kg-titlebar-text)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '9px 14px',
  flexShrink: 0
}
const headerTitleStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 500,
  letterSpacing: '0.02em'
}
const closeBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--kg-titlebar-text)',
  fontSize: 18,
  lineHeight: 1,
  borderRadius: 3,
  width: 22,
  height: 22,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0
}
const bodyStyle: React.CSSProperties = {
  padding: '20px 24px',
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
  overflowY: 'auto'
}
