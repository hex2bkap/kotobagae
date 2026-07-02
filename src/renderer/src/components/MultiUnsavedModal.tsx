import { useState } from 'react'
import { Modal } from './Modal'

export interface UnsavedTabInfo {
  id: string
  name: string          // 表示名
  filePath: string | null
}

export type MultiUnsavedResult =
  | { action: 'saveSelected'; idsToSave: string[] }
  | { action: 'discardAll' }
  | { action: 'cancel' }

interface Props {
  tabs: UnsavedTabInfo[]
  autosaveEnabled: boolean
  onResult: (result: MultiUnsavedResult) => void
}

export function MultiUnsavedModal({ tabs, autosaveEnabled, onResult }: Props): JSX.Element {
  const savableTabs = tabs.filter((t) => t.filePath !== null)
  const [checked, setChecked] = useState<Set<string>>(
    () => new Set(savableTabs.map((t) => t.id))
  )

  const toggle = (id: string): void => {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSave = (): void => {
    onResult({ action: 'saveSelected', idsToSave: [...checked] })
  }

  const handleDiscard = (): void => {
    onResult({ action: 'discardAll' })
  }

  const handleCancel = (): void => {
    onResult({ action: 'cancel' })
  }

  return (
    <Modal title="未保存の変更" onClose={handleCancel} width={520}>
        <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--kg-text-secondary)' }}>
          保存するファイルを選んでください。チェックを外したファイルの変更は破棄されます。
        </p>

        <div style={{
          border: '1px solid var(--kg-border)',
          borderRadius: 4,
          maxHeight: 280,
          overflowY: 'auto',
          marginBottom: 16
        }}>
          {tabs.map((tab) => {
            const isSavable = tab.filePath !== null
            return (
              <label
                key={tab.id}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  padding: '10px 12px',
                  borderBottom: '1px solid var(--kg-border)',
                  cursor: isSavable ? 'pointer' : 'default',
                  background: 'var(--kg-bg-primary)'
                }}
              >
                <input
                  type="checkbox"
                  checked={isSavable && checked.has(tab.id)}
                  disabled={!isSavable}
                  onChange={() => isSavable && toggle(tab.id)}
                  style={{ marginTop: 2, flexShrink: 0 }}
                />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 'bold', color: 'var(--kg-text-primary)' }}>
                    {tab.name}
                  </div>
                  {!isSavable && (
                    <div style={{ fontSize: 12, color: 'var(--kg-text-secondary)', marginTop: 2 }}>
                      {autosaveEnabled
                        ? '（無題 ＝ 自動保存に退避済み・復元で戻せる）'
                        : '（無題 ＝ 自動保存が無効のため保存されません）'}
                    </div>
                  )}
                </div>
              </label>
            )
          })}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <button onClick={handleCancel} style={cancelBtnStyle}>キャンセル</button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleDiscard} style={discardBtnStyle}>
              保存せず閉じる
            </button>
            <button
              onClick={handleSave}
              disabled={checked.size === 0}
              style={{ ...saveBtnStyle, opacity: checked.size === 0 ? 0.5 : 1, cursor: checked.size === 0 ? 'default' : 'pointer' }}
            >
              選択を保存して閉じる
            </button>
          </div>
        </div>
    </Modal>
  )
}

const cancelBtnStyle: React.CSSProperties = {
  padding: '6px 16px', fontSize: 13, cursor: 'pointer',
  border: '1px solid var(--kg-border-strong)', borderRadius: 4,
  background: 'var(--kg-bg-primary)', color: 'var(--kg-text-primary)'
}
const discardBtnStyle: React.CSSProperties = {
  padding: '6px 16px', fontSize: 13, cursor: 'pointer',
  border: '1px solid var(--kg-border-strong)', borderRadius: 4,
  background: 'var(--kg-bg-primary)', color: 'var(--kg-text-secondary)'
}
const saveBtnStyle: React.CSSProperties = {
  padding: '6px 16px', fontSize: 13,
  border: 'none', borderRadius: 4,
  background: 'var(--kg-accent)', color: '#fff'
}
