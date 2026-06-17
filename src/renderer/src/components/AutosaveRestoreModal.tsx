import { useState, useEffect } from 'react'

interface AutosaveFile {
  path: string
  name: string
  mtime: number
  preview: string
}

interface Props {
  onClose: () => void
  onOpen: (content: string) => void
}

export function AutosaveRestoreModal({ onClose, onOpen }: Props): JSX.Element {
  const [files, setFiles] = useState<AutosaveFile[] | null>(null)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)

  useEffect(() => {
    window.api.autosave.list().then(setFiles)
  }, [])

  const handleOpen = async (): Promise<void> => {
    if (!selectedPath) return
    const content = await window.api.autosave.open(selectedPath)
    if (content === null) return
    onOpen(content)
    onClose()
  }

  const formatDate = (mtime: number): string => {
    return new Date(mtime).toLocaleString('ja-JP', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit'
    })
  }

  const parseBaseName = (name: string): string => {
    // ファイル名形式: baseName_YYYY-MM-DDTHH-MM-SS-mmmZ.txt
    const match = name.match(/^(.+)_\d{4}-\d{2}-\d{2}T.+\.txt$/)
    return match ? match[1] : name.replace('.txt', '')
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 'bold' }}>
          自動保存から復元
        </h2>

        {files === null ? (
          <p style={{ color: '#555', fontSize: 13 }}>読み込み中...</p>
        ) : files.length === 0 ? (
          <p style={{ color: '#777', fontSize: 13 }}>自動保存ファイルが見つかりません。</p>
        ) : (
          <div style={{ maxHeight: 360, overflowY: 'auto', border: '1px solid #ddd', borderRadius: 4 }}>
            {files.map((f) => (
              <div
                key={f.path}
                onClick={() => setSelectedPath(f.path)}
                style={{
                  padding: '10px 12px',
                  borderBottom: '1px solid #eee',
                  cursor: 'pointer',
                  background: selectedPath === f.path ? '#e3f0ff' : '#fff'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ fontWeight: 'bold', color: '#222' }}>
                    {parseBaseName(f.name)}
                  </span>
                  <span style={{ color: '#777', flexShrink: 0, marginLeft: 12 }}>
                    {formatDate(f.mtime)}
                  </span>
                </div>
                {f.preview && (
                  <div style={{
                    marginTop: 4, fontSize: 12, color: '#555',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                  }}>
                    {f.preview}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button onClick={onClose} style={cancelButtonStyle}>閉じる</button>
          <button
            onClick={handleOpen}
            disabled={!selectedPath}
            style={{ ...okButtonStyle, opacity: selectedPath ? 1 : 0.5, cursor: selectedPath ? 'pointer' : 'default' }}
          >
            新しいタブで開く
          </button>
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
  background: '#fff', borderRadius: 8, padding: '24px 28px',
  width: 560, boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
  display: 'flex', flexDirection: 'column'
}
const cancelButtonStyle: React.CSSProperties = {
  padding: '6px 16px', fontSize: 13, cursor: 'pointer',
  border: '1px solid #ccc', borderRadius: 4, background: '#fff'
}
const okButtonStyle: React.CSSProperties = {
  padding: '6px 16px', fontSize: 13,
  border: 'none', borderRadius: 4, background: '#1976d2', color: '#fff'
}
