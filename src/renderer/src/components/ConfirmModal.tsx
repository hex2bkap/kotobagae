import { Modal } from './Modal'

interface Props {
  message: string
  onOk: () => void
  onCancel: () => void
}

export function ConfirmModal({ message, onOk, onCancel }: Props): JSX.Element {
  return (
    <Modal title="確認" onClose={onCancel} width={320}>
      <p style={{ margin: '0 0 20px', fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap', color: 'var(--kg-text-primary)' }}>
        {message}
      </p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button
          onClick={onCancel}
          style={{ padding: '6px 16px', fontSize: 13, cursor: 'pointer', borderRadius: 4, border: '1px solid var(--kg-border)', background: 'var(--kg-bg-secondary)', color: 'var(--kg-text-primary)' }}
        >
          キャンセル
        </button>
        <button
          onClick={onOk}
          style={{ padding: '6px 16px', fontSize: 13, cursor: 'pointer', background: 'var(--kg-accent)', color: 'var(--kg-bg-primary)', border: 'none', borderRadius: 4 }}
        >
          OK
        </button>
      </div>
    </Modal>
  )
}
