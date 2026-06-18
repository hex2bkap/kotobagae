import { useState } from 'react'

export interface StatusInfo {
  line: number
  col: number
  charCount: number        // 空白・改行除く
  selText: string | null   // 選択中テキスト（null=選択なし）
  sessionDelta: number     // セッション開始からの増加文字数（空白除く）
}

interface Props {
  info: StatusInfo
  showWritingStats: boolean
  wordGoal: number         // 0 = 無効
  onLineJump: () => void
}

export function StatusBar({ info, showWritingStats, wordGoal, onLineJump }: Props): JSX.Element {
  const [selWithWS, setSelWithWS] = useState(false)

  const genkoPages = (info.charCount / 400).toFixed(1)

  const selCount = info.selText
    ? selWithWS
      ? info.selText.length
      : info.selText.replace(/\s/g, '').length
    : null

  const goalPct = wordGoal > 0 ? Math.min(100, Math.round((info.charCount / wordGoal) * 100)) : 0
  const achieved = wordGoal > 0 && info.charCount >= wordGoal

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '2px 12px',
      background: 'var(--kg-bg-secondary)',
      borderTop: '1px solid var(--kg-border)',
      fontSize: 12, color: 'var(--kg-text-secondary)',
      flexShrink: 0, minHeight: 26, flexWrap: 'wrap'
    }}>
      {/* カーソル位置（クリックで行ジャンプ） */}
      <span
        onClick={onLineJump}
        title="クリックで行番号ジャンプ (Ctrl+G)"
        style={{ cursor: 'pointer', textDecoration: 'underline dotted' }}
      >
        行 {info.line}, 列 {info.col}
      </span>

      <Divider />

      {/* 文字数 */}
      <span title="空白・改行を除く文字数">{info.charCount.toLocaleString()} 字</span>

      <Divider />

      {/* 原稿用紙換算 */}
      <span title="400字詰め原稿用紙換算">{genkoPages} 枚</span>

      {/* 選択範囲文字数（選択中のみ表示） */}
      {selCount !== null && (
        <>
          <Divider />
          <span
            onClick={() => setSelWithWS((v) => !v)}
            title={selWithWS ? '空白込み（クリックで空白除きに切替）' : '空白除き（クリックで空白込みに切替）'}
            style={{ cursor: 'pointer', textDecoration: 'underline dotted' }}
          >
            選択: {selCount.toLocaleString()} 字{selWithWS ? '(空白込)' : ''}
          </span>
        </>
      )}

      {/* 執筆統計ブロック（設定でオン） */}
      {showWritingStats && (
        <>
          <Divider />
          <span title="このセッションでの執筆文字数（空白除く）">
            今回: +{info.sessionDelta.toLocaleString()} 字
          </span>

          {wordGoal > 0 && (
            <>
              <Divider />
              <span title={`目標: ${wordGoal.toLocaleString()} 字`}>
                目標: {goalPct}%
              </span>
              {/* プログレスバー */}
              <div style={{
                width: 80, height: 8,
                background: 'var(--kg-border)',
                borderRadius: 4, overflow: 'hidden',
                alignSelf: 'center'
              }}>
                <div style={{
                  width: `${goalPct}%`, height: '100%',
                  background: achieved ? '#27ae60' : 'var(--kg-accent)',
                  borderRadius: 4, transition: 'width 0.3s'
                }} />
              </div>
              {achieved && (
                <span style={{ color: '#27ae60', fontWeight: 'bold' }}>達成！</span>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}

function Divider(): JSX.Element {
  return <span style={{ color: 'var(--kg-border-strong)', userSelect: 'none' }}>|</span>
}
