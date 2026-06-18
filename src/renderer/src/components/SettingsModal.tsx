import { useState, useEffect } from 'react'
import type { AppSettings } from '../../../shared/settings-types'

interface Props {
  onClose: () => void
  onSave: (settings: AppSettings) => void
}

const INTERVAL_OPTIONS = [1, 3, 5, 10, 15, 30]
const MAX_AGE_OPTIONS = [0, 7, 14, 30, 60, 90]

export function SettingsModal({ onClose, onSave }: Props): JSX.Element {
  const [settings, setSettings] = useState<AppSettings | null>(null)

  useEffect(() => {
    window.api.settings.load().then((s) =>
      setSettings({
        windowBounds: s.windowBounds,
        autosave: { ...s.autosave },
        dictSort: { ...s.dictSort },
        display: { ...(s.display ?? { theme: 'light', showWritingStats: false, wordGoal: 0 }) }
      })
    )
  }, [])

  if (!settings) {
    return (
      <div style={overlayStyle}>
        <div style={modalStyle}>
          <p style={{ color: '#555' }}>読み込み中...</p>
        </div>
      </div>
    )
  }

  const handleSave = async (): Promise<void> => {
    await window.api.settings.save(settings)
    onSave(settings)
    onClose()
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 'bold' }}>設定</h2>

        {/* 自動保存 */}
        <section style={sectionStyle}>
          <h3 style={sectionTitleStyle}>自動保存</h3>

          <label style={rowStyle}>
            <input
              type="checkbox"
              checked={settings.autosave.enabled}
              onChange={(e) =>
                setSettings({ ...settings, autosave: { ...settings.autosave, enabled: e.target.checked } })
              }
            />
            <span style={{ marginLeft: 6 }}>自動保存を有効にする</span>
          </label>

          <div style={{ ...rowStyle, opacity: settings.autosave.enabled ? 1 : 0.4 }}>
            <label>保存間隔</label>
            <select
              value={settings.autosave.intervalMinutes}
              disabled={!settings.autosave.enabled}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  autosave: { ...settings.autosave, intervalMinutes: Number(e.target.value) }
                })
              }
              style={selectStyle}
            >
              {INTERVAL_OPTIONS.map((m) => (
                <option key={m} value={m}>{m}分</option>
              ))}
            </select>
          </div>

          <div style={{ ...rowStyle, opacity: settings.autosave.enabled ? 1 : 0.4 }}>
            <label>自動保存ファイルの保持期間</label>
            <select
              value={settings.autosave.maxAgeDays}
              disabled={!settings.autosave.enabled}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  autosave: { ...settings.autosave, maxAgeDays: Number(e.target.value) }
                })
              }
              style={selectStyle}
            >
              {MAX_AGE_OPTIONS.map((d) => (
                <option key={d} value={d}>{d === 0 ? '削除しない' : `${d}日`}</option>
              ))}
            </select>
          </div>
        </section>

        {/* 辞書・変換候補 */}
        <section style={sectionStyle}>
          <h3 style={sectionTitleStyle}>辞書・変換候補</h3>

          <label style={rowStyle}>
            <input
              type="checkbox"
              checked={settings.dictSort.byFrequency}
              onChange={(e) =>
                setSettings({ ...settings, dictSort: { ...settings.dictSort, byFrequency: e.target.checked } })
              }
            />
            <span style={{ marginLeft: 6 }}>候補を頻度でおすすめ順にする</span>
          </label>

          <label style={rowStyle}>
            <input
              type="checkbox"
              checked={settings.dictSort.showCount}
              onChange={(e) =>
                setSettings({ ...settings, dictSort: { ...settings.dictSort, showCount: e.target.checked } })
              }
            />
            <span style={{ marginLeft: 6 }}>使用回数を辞書管理ウィンドウに表示する</span>
          </label>
        </section>

        {/* 表示 */}
        <section style={sectionStyle}>
          <h3 style={sectionTitleStyle}>表示</h3>

          <div style={rowStyle}>
            <label>テーマ</label>
            <select
              value={settings.display?.theme ?? 'light'}
              onChange={(e) =>
                setSettings({ ...settings, display: { ...(settings.display ?? { theme: 'light', showWritingStats: false, wordGoal: 0 }), theme: e.target.value as 'light' | 'dark' } })
              }
              style={selectStyle}
            >
              <option value="light">ライト</option>
              <option value="dark">ダーク</option>
            </select>
          </div>

          <label style={rowStyle}>
            <input
              type="checkbox"
              checked={settings.display?.showWritingStats ?? false}
              onChange={(e) =>
                setSettings({ ...settings, display: { ...(settings.display ?? { theme: 'light', showWritingStats: false, wordGoal: 0 }), showWritingStats: e.target.checked } })
              }
            />
            <span style={{ marginLeft: 6 }}>ステータスバーに執筆統計を表示する</span>
          </label>

          <div style={{ ...rowStyle, opacity: settings.display?.showWritingStats ? 1 : 0.4 }}>
            <label>文字数目標</label>
            <input
              type="number"
              min={0}
              value={settings.display?.wordGoal ?? 0}
              disabled={!settings.display?.showWritingStats}
              onChange={(e) =>
                setSettings({ ...settings, display: { ...(settings.display ?? { theme: 'light', showWritingStats: false, wordGoal: 0 }), wordGoal: Math.max(0, Number(e.target.value)) } })
              }
              style={{ ...selectStyle, width: 90 }}
            />
            <span style={{ fontSize: 12, color: '#888' }}>字（0 = 無効）</span>
          </div>
        </section>

        {/* データフォルダ */}
        <section style={sectionStyle}>
          <h3 style={sectionTitleStyle}>データフォルダ</h3>
          <button onClick={() => window.api.openDataDir()} style={linkButtonStyle}>
            データフォルダを開く →
          </button>
        </section>

        {/* ボタン */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
          <button onClick={onClose} style={cancelButtonStyle}>キャンセル</button>
          <button onClick={handleSave} style={okButtonStyle}>保存</button>
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
  minWidth: 380, boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
  display: 'flex', flexDirection: 'column'
}
const sectionStyle: React.CSSProperties = {
  marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid #eee'
}
const sectionTitleStyle: React.CSSProperties = {
  margin: '0 0 10px', fontSize: 13, fontWeight: 'bold', color: '#444'
}
const rowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: 13
}
const selectStyle: React.CSSProperties = {
  fontSize: 13, padding: '2px 4px', marginLeft: 8
}
const linkButtonStyle: React.CSSProperties = {
  background: 'none', border: 'none', color: '#1565c0',
  cursor: 'pointer', fontSize: 13, padding: 0, textDecoration: 'underline'
}
const cancelButtonStyle: React.CSSProperties = {
  padding: '6px 16px', fontSize: 13, cursor: 'pointer',
  border: '1px solid #ccc', borderRadius: 4, background: '#fff'
}
const okButtonStyle: React.CSSProperties = {
  padding: '6px 16px', fontSize: 13, cursor: 'pointer',
  border: 'none', borderRadius: 4, background: '#1976d2', color: '#fff'
}
