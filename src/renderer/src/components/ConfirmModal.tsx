interface Props {
  message: string
  onOk: () => void
  onCancel: () => void
}

export function ConfirmModal({ message, onOk, onCancel }: Props): JSX.Element {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200
    }}>
      <div style={{
        background: '#fff', borderRadius: 8, padding: '24px 28px',
        minWidth: 280, boxShadow: '0 4px 24px rgba(0,0,0,0.18)'
      }}>
        <p style={{ margin: '0 0 20px', fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
          {message}
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{ padding: '6px 16px', fontSize: 13, cursor: 'pointer', borderRadius: 4 }}
          >
            キャンセル
          </button>
          <button
            onClick={onOk}
            style={{
              padding: '6px 16px', fontSize: 13, cursor: 'pointer',
              background: '#c62828', color: '#fff', border: 'none', borderRadius: 4
            }}
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  )
}
