import { Modal } from './Modal'

const SHORTCUTS: { key: string; desc: string }[] = [
  { key: 'Ctrl+N',         desc: '新規タブ' },
  { key: 'Ctrl+O',         desc: 'ファイルを開く' },
  { key: 'Ctrl+S',         desc: '上書き保存' },
  { key: 'Ctrl+Shift+S',   desc: '別名で保存' },
  { key: 'Ctrl+W',         desc: 'タブを閉じる' },
  { key: 'Ctrl+Z',         desc: '元に戻す' },
  { key: 'Ctrl+Y',         desc: 'やり直し' },
  { key: 'Ctrl+F',         desc: '検索' },
  { key: 'Ctrl+H',         desc: '検索・置換' },
  { key: 'Ctrl+G',         desc: '指定行へジャンプ' },
  { key: 'Ctrl+D',         desc: '選択テキストを辞書に登録' },
  { key: 'Ctrl++',         desc: 'フォントサイズを大きく' },
  { key: 'Ctrl+-',         desc: 'フォントサイズを小さく' },
  { key: 'Ctrl+,',         desc: '設定を開く' },
  { key: 'F11',            desc: '集中モード 切替' },
  { key: 'Enter',          desc: '変換候補を確定' },
  { key: 'Esc',            desc: '変換候補 / 検索パネルを閉じる' },
]

interface Props {
  onClose: () => void
}

export function ShortcutModal({ onClose }: Props): JSX.Element {
  return (
    <Modal title="キーボードショートカット" onClose={onClose} width={420}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <tbody>
          {SHORTCUTS.map(({ key, desc }) => (
            <tr key={key} style={{ borderBottom: '1px solid var(--kg-border)' }}>
              <td style={{
                padding: '6px 12px 6px 0',
                fontFamily: '"Consolas", "Courier New", monospace',
                color: 'var(--kg-text-primary)',
                whiteSpace: 'nowrap',
                width: '40%'
              }}>
                <kbd style={{
                  display: 'inline-block', padding: '1px 6px',
                  background: 'var(--kg-bg-tertiary)',
                  border: '1px solid var(--kg-border-strong)',
                  borderRadius: 3, fontSize: 12
                }}>{key}</kbd>
              </td>
              <td style={{ padding: '6px 0', color: 'var(--kg-text-secondary)' }}>{desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  )
}
