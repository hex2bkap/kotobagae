import React from 'react'

interface Props {
  onClose: () => void
}

export function AboutModal({ onClose }: Props): JSX.Element {
  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 'bold', color: 'var(--kg-accent)' }}>
          コトバガエ
        </h2>
        <p style={{ margin: '0 0 4px', fontSize: 12, color: 'var(--kg-text-muted)' }}>
          バージョン 1.0.0
        </p>
        <p style={{ margin: '16px 0 0', fontSize: 13, color: 'var(--kg-text-secondary)', lineHeight: 1.7 }}>
          作品ごとに辞書を切り替えられる、<br />
          日本語創作執筆向けテキストエディタ。
        </p>
        <p style={{ margin: '12px 0 0', fontSize: 12, color: 'var(--kg-text-muted)' }}>
          作者：hex2bkap
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>
          <button onClick={onClose} style={closeButtonStyle}>閉じる</button>
        </div>
      </div>
    </div>
  )
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 200,
  background: 'rgba(0,0,0,0.35)',
  display: 'flex', alignItems: 'center', justifyContent: 'center'
}
const modalStyle: React.CSSProperties = {
  background: 'var(--kg-bg-primary)', borderRadius: 8, padding: '28px 32px',
  width: 320, boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
  color: 'var(--kg-text-primary)'
}
const closeButtonStyle: React.CSSProperties = {
  padding: '6px 20px', fontSize: 13, cursor: 'pointer',
  border: '1px solid var(--kg-border)', borderRadius: 4,
  background: 'var(--kg-bg-secondary)', color: 'var(--kg-text-primary)'
}
