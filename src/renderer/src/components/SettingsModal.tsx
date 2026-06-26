import { useState, useEffect } from 'react'
import type { AppSettings } from '../../../shared/settings-types'
import { DEFAULT_SETTINGS } from '../../../shared/settings-types'

interface Props {
  dictList: string[]
  priorityOrder: string[]
  onClose: () => void
  onSave: (settings: AppSettings) => void
}

type TabKey = 'display' | 'dict' | 'other'

const INTERVAL_OPTIONS = [1, 3, 5, 10, 15, 30]
const MAX_AGE_OPTIONS = [1, 7, 14, 30, -1]   // -1 = 無期限（削除しない）
const MAX_CANDIDATES_OPTIONS = [5, 10, 15, 20]
const FONT_FAMILY_OPTIONS: { label: string; value: string }[] = [
  { label: 'Yu Gothic UI（既定）', value: 'Yu Gothic UI' },
  { label: 'Meiryo', value: 'Meiryo' },
  { label: 'BIZ UDGothic', value: 'BIZ UDGothic' },
  { label: 'Noto Sans JP', value: 'Noto Sans JP' },
  { label: 'MS Gothic', value: 'MS Gothic' },
  { label: 'MS Mincho', value: 'MS Mincho' },
]

function sortByPriority(names: string[], order: string[]): string[] {
  return names.slice().sort((a, b) => {
    const ia = order.indexOf(a), ib = order.indexOf(b)
    return (ia === -1 ? Infinity : ia) - (ib === -1 ? Infinity : ib)
  })
}

export function SettingsModal({ dictList, priorityOrder, onClose, onSave }: Props): JSX.Element {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [activeTab, setActiveTab] = useState<TabKey>('display')

  useEffect(() => {
    window.api.settings.load().then((s) =>
      setSettings({
        windowBounds: s.windowBounds,
        dictWindowBounds: s.dictWindowBounds,
        autosave: { ...s.autosave },
        dictSort: {
          byFrequency: s.dictSort?.byFrequency ?? DEFAULT_SETTINGS.dictSort.byFrequency,
          showCount: s.dictSort?.showCount ?? DEFAULT_SETTINGS.dictSort.showCount,
          maxCandidates: s.dictSort?.maxCandidates ?? DEFAULT_SETTINGS.dictSort.maxCandidates
        },
        display: { ...DEFAULT_SETTINGS.display, ...s.display },
        dictPriorityOrder: s.dictPriorityOrder ?? [],
        defaultDictNames: s.defaultDictNames ?? []
      })
    )
  }, [])

  if (!settings) {
    return (
      <div style={overlayStyle}>
        <div style={modalStyle}>
          <p style={{ color: 'var(--kg-text-muted)' }}>読み込み中...</p>
        </div>
      </div>
    )
  }

  const handleSave = async (): Promise<void> => {
    await window.api.settings.save(settings)
    onSave(settings)
    onClose()
  }

  const setDisplay = (patch: Partial<AppSettings['display']>): void =>
    setSettings((prev) => prev ? { ...prev, display: { ...prev.display, ...patch } } : prev)

  const setDictSort = (patch: Partial<AppSettings['dictSort']>): void =>
    setSettings((prev) => prev ? { ...prev, dictSort: { ...prev.dictSort, ...patch } } : prev)

  const resetDisplay = (): void => setDisplay({ ...DEFAULT_SETTINGS.display })

  const orderedDicts = sortByPriority(dictList, priorityOrder)

  const toggleDefaultDict = (name: string, checked: boolean): void => {
    setSettings((prev) => {
      if (!prev) return prev
      const next = checked
        ? [...prev.defaultDictNames, name]
        : prev.defaultDictNames.filter((n) => n !== name)
      return { ...prev, defaultDictNames: next }
    })
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 'bold', color: 'var(--kg-text-primary)' }}>設定</h2>

        {/* タブバー */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--kg-border-strong)', marginBottom: 16 }}>
          {([['display', '表示'], ['dict', '辞書・候補'], ['other', '自動保存・その他']] as [TabKey, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '6px 14px', fontSize: 13,
                color: activeTab === key ? 'var(--kg-text-primary)' : 'var(--kg-text-muted)',
                borderBottom: activeTab === key ? '2px solid var(--kg-accent)' : '2px solid transparent',
                marginBottom: -1, fontWeight: activeTab === key ? 'bold' : 'normal'
              }}
            >{label}</button>
          ))}
        </div>

        {/* ── タブ1: 表示 ── */}
        {activeTab === 'display' && (
          <div style={tabContentStyle}>
            <Row label="テーマ">
              <select value={settings.display.theme} onChange={(e) => setDisplay({ theme: e.target.value as AppSettings['display']['theme'] })} style={selectStyle}>
                <option value="washi">和紙（Washi）</option>
                <option value="dark">ダーク（Dark）</option>
                <option value="light">ライト（Light）</option>
                <option value="sumi">墨夜（Sumi）</option>
              </select>
            </Row>

            <Row label="フォントサイズ">
              <input
                type="number" min={10} max={40} step={2}
                value={settings.display.fontSize}
                onChange={(e) => setDisplay({ fontSize: Math.max(10, Math.min(40, Number(e.target.value))) })}
                style={{ ...selectStyle, width: 70 }}
              />
              <span style={unitStyle}>px</span>
            </Row>

            <Row label="フォント種類">
              <select value={settings.display.fontFamily} onChange={(e) => setDisplay({ fontFamily: e.target.value })} style={selectStyle}>
                {FONT_FAMILY_OPTIONS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </Row>

            <p style={{ margin: '8px 0 6px', fontSize: 12, color: 'var(--kg-text-muted)' }}>
              テーマの明るさごとに文字色を持てます
            </p>

            <Row label="明るいテーマ用">
              <input
                type="color"
                value={settings.display.textColorLight || '#2c2416'}
                onChange={(e) => setDisplay({ textColorLight: e.target.value })}
                style={{ width: 40, height: 26, padding: 1, border: '1px solid var(--kg-border-strong)', borderRadius: 3, cursor: 'pointer' }}
              />
              {settings.display.textColorLight && (
                <button onClick={() => setDisplay({ textColorLight: '' })} style={resetSmallStyle} title="テーマ既定色に戻す">×</button>
              )}
              {!settings.display.textColorLight && <span style={unitStyle}>テーマ既定</span>}
            </Row>

            <Row label="暗いテーマ用">
              <input
                type="color"
                value={settings.display.textColorDark || '#c8c0b0'}
                onChange={(e) => setDisplay({ textColorDark: e.target.value })}
                style={{ width: 40, height: 26, padding: 1, border: '1px solid var(--kg-border-strong)', borderRadius: 3, cursor: 'pointer' }}
              />
              {settings.display.textColorDark && (
                <button onClick={() => setDisplay({ textColorDark: '' })} style={resetSmallStyle} title="テーマ既定色に戻す">×</button>
              )}
              {!settings.display.textColorDark && <span style={unitStyle}>テーマ既定</span>}
            </Row>

            <CheckRow
              checked={settings.display.boldText}
              onChange={(v) => setDisplay({ boldText: v })}
              label="本文を太字で表示"
            />

            <CheckRow
              checked={settings.display.wordWrap}
              onChange={(v) => setDisplay({ wordWrap: v })}
              label="折り返し"
            />

            <div style={{ borderTop: '1px solid var(--kg-border)', marginTop: 8, paddingTop: 10 }}>
              <p style={{ margin: '0 0 6px', fontSize: 12, color: 'var(--kg-text-secondary)', fontWeight: 'bold' }}>執筆の進捗</p>
              <CheckRow
                checked={settings.display.showWritingStats}
                onChange={(v) => setDisplay({ showWritingStats: v })}
                label="ステータスバーに進捗を表示する（今回の文字数・目標達成率）"
              />
              <div style={{ ...rowStyle, opacity: settings.display.showWritingStats ? 1 : 0.4 }}>
                <label style={{ fontSize: 13, color: 'var(--kg-text-primary)' }}>文字数目標</label>
                <input
                  type="number" min={0}
                  value={settings.display.wordGoal}
                  disabled={!settings.display.showWritingStats}
                  onChange={(e) => setDisplay({ wordGoal: Math.max(0, Number(e.target.value)) })}
                  style={{ ...selectStyle, width: 90 }}
                />
                <span style={unitStyle}>字（0 = 無効）</span>
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <button onClick={resetDisplay} style={linkButtonStyle}>
                表示設定をデフォルトに戻す
              </button>
            </div>
          </div>
        )}

        {/* ── タブ2: 辞書・候補 ── */}
        {activeTab === 'dict' && (
          <div style={tabContentStyle}>
            <p style={sectionHeadStyle}>変換候補の表示</p>
            <CheckRow
              checked={settings.dictSort.byFrequency}
              onChange={(v) => setDictSort({ byFrequency: v })}
              label="変換候補をよく使う順に並べる"
            />
            <CheckRow
              checked={settings.dictSort.showCount}
              onChange={(v) => setDictSort({ showCount: v })}
              label="辞書管理で使用回数を表示する"
            />
            <Row label="最大表示候補数">
              <select
                value={settings.dictSort.maxCandidates}
                onChange={(e) => setDictSort({ maxCandidates: Number(e.target.value) })}
                style={selectStyle}
              >
                {MAX_CANDIDATES_OPTIONS.map((n) => <option key={n} value={n}>{n}件</option>)}
              </select>
            </Row>

            <div style={{ borderTop: '1px solid var(--kg-border)', marginTop: 10, paddingTop: 10 }}>
              <p style={sectionHeadStyle}>新規タブで開く辞書</p>
              {orderedDicts.length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--kg-text-muted)' }}>辞書がありません</p>
              ) : (
                <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid var(--kg-border)', borderRadius: 4, padding: '4px 0' }}>
                  {orderedDicts.map((name) => (
                    <label key={name} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', fontSize: 13, cursor: 'pointer', color: 'var(--kg-text-primary)' }}>
                      <input
                        type="checkbox"
                        checked={settings.defaultDictNames.includes(name)}
                        onChange={(e) => toggleDefaultDict(name, e.target.checked)}
                      />
                      {name}
                    </label>
                  ))}
                </div>
              )}
              <p style={{ fontSize: 11, color: 'var(--kg-text-muted)', margin: '6px 0 0' }}>
                チェックした辞書が新規タブで自動的に有効になります。
              </p>
              <p style={{ fontSize: 11, color: 'var(--kg-text-muted)', margin: '3px 0 0' }}>
                複数選んだ場合は、辞書管理の優先度順（上が高い）で表示されます。
              </p>
            </div>
          </div>
        )}

        {/* ── タブ3: 自動保存・その他 ── */}
        {activeTab === 'other' && (
          <div style={tabContentStyle}>
            <p style={sectionHeadStyle}>自動保存</p>
            <CheckRow
              checked={settings.autosave.enabled}
              onChange={(v) => setSettings((prev) => prev ? { ...prev, autosave: { ...prev.autosave, enabled: v } } : prev)}
              label="自動保存を有効にする"
            />
            <div style={{ opacity: settings.autosave.enabled ? 1 : 0.4 }}>
              <Row label="保存間隔">
                <select
                  value={settings.autosave.intervalMinutes}
                  disabled={!settings.autosave.enabled}
                  onChange={(e) => setSettings((prev) => prev ? { ...prev, autosave: { ...prev.autosave, intervalMinutes: Number(e.target.value) } } : prev)}
                  style={selectStyle}
                >
                  {INTERVAL_OPTIONS.map((m) => <option key={m} value={m}>{m}分</option>)}
                </select>
              </Row>
              <Row label="保存ファイルの保持期間">
                <select
                  value={settings.autosave.maxAgeDays}
                  disabled={!settings.autosave.enabled}
                  onChange={(e) => setSettings((prev) => prev ? { ...prev, autosave: { ...prev.autosave, maxAgeDays: Number(e.target.value) } } : prev)}
                  style={selectStyle}
                >
                  {MAX_AGE_OPTIONS.map((d) => <option key={d} value={d}>{d === -1 ? '削除しない（無期限）' : `${d}日`}</option>)}
                </select>
              </Row>
            </div>

            <div style={{ borderTop: '1px solid var(--kg-border)', marginTop: 12, paddingTop: 12 }}>
              <p style={sectionHeadStyle}>データ</p>
              <button onClick={() => window.api.openAutosaveDir()} style={linkButtonStyle}>
                自動保存フォルダを開く →
              </button>
              <button onClick={() => window.api.openDataDir()} style={{ ...linkButtonStyle, marginLeft: 12 }}>
                データフォルダを開く →
              </button>
            </div>
          </div>
        )}

        {/* ボタン */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--kg-border)' }}>
          <button onClick={onClose} style={cancelButtonStyle}>キャンセル</button>
          <button onClick={handleSave} style={okButtonStyle}>保存</button>
        </div>
      </div>
    </div>
  )
}

// ── 共通 UI ───────────────────────────────────────────────────────────────────

function Row({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div style={rowStyle}>
      <label style={{ fontSize: 13, color: 'var(--kg-text-primary)', minWidth: 160 }}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{children}</div>
    </div>
  )
}

function CheckRow({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }): JSX.Element {
  return (
    <label style={{ ...rowStyle, cursor: 'pointer' }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span style={{ fontSize: 13, color: 'var(--kg-text-primary)', marginLeft: 4 }}>{label}</span>
    </label>
  )
}

// ── スタイル ─────────────────────────────────────────────────────────────────

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 200,
  background: 'rgba(0,0,0,0.4)',
  display: 'flex', alignItems: 'center', justifyContent: 'center'
}
const modalStyle: React.CSSProperties = {
  background: 'var(--kg-bg-primary)',
  border: '1px solid var(--kg-border-strong)',
  borderRadius: 8, padding: '20px 24px',
  width: 480, maxHeight: '85vh',
  display: 'flex', flexDirection: 'column',
  boxShadow: '0 8px 32px rgba(0,0,0,0.25)'
}
const tabContentStyle: React.CSSProperties = {
  flex: 1, overflowY: 'auto', paddingRight: 4
}
const rowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', marginBottom: 10
}
const sectionHeadStyle: React.CSSProperties = {
  margin: '0 0 8px', fontSize: 12, fontWeight: 'bold',
  color: 'var(--kg-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em'
}
const selectStyle: React.CSSProperties = {
  fontSize: 13, padding: '2px 6px', marginLeft: 8,
  background: 'var(--kg-bg-secondary)', color: 'var(--kg-text-primary)',
  border: '1px solid var(--kg-border-strong)', borderRadius: 3
}
const unitStyle: React.CSSProperties = {
  fontSize: 12, color: 'var(--kg-text-muted)', marginLeft: 4
}
const resetSmallStyle: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer',
  fontSize: 14, color: 'var(--kg-text-muted)', padding: '0 4px', lineHeight: 1
}
const linkButtonStyle: React.CSSProperties = {
  background: 'none', border: 'none',
  color: 'var(--kg-accent)', cursor: 'pointer',
  fontSize: 13, padding: 0, textDecoration: 'underline'
}
const cancelButtonStyle: React.CSSProperties = {
  padding: '6px 16px', fontSize: 13, cursor: 'pointer',
  border: '1px solid var(--kg-border-strong)', borderRadius: 4,
  background: 'var(--kg-bg-secondary)', color: 'var(--kg-text-primary)'
}
const okButtonStyle: React.CSSProperties = {
  padding: '6px 16px', fontSize: 13, cursor: 'pointer',
  border: 'none', borderRadius: 4,
  background: 'var(--kg-accent)', color: '#fff'
}
