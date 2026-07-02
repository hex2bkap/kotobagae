import React, { useEffect, useState } from 'react'
import { Modal } from './Modal'

// 公開前にURLを差し込む。空文字のままなら該当リンクは非表示になる
const ABOUT_LINKS = {
  readme: '',
  donate: ''
}

interface Props {
  onClose: () => void
}

export function AboutModal({ onClose }: Props): JSX.Element {
  const [version, setVersion] = useState<string>('...')

  useEffect(() => {
    window.api.getVersion().then(setVersion).catch(() => setVersion(''))
  }, [])

  return (
    <Modal title="このアプリについて" onClose={onClose} width={340}>
      <h2 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 'bold', color: 'var(--kg-accent)' }}>
        コトバガエ
      </h2>
      {version && (
        <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--kg-text-muted)' }}>
          バージョン {version}
        </p>
      )}

      <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--kg-text-secondary)', lineHeight: 1.7 }}>
        複数の辞書を重ねて使い、切り替えられる執筆用テキストエディタ。
      </p>

      <p style={{ margin: '0 0 6px', fontSize: 12, color: 'var(--kg-text-muted)' }}>
        作者：hex2bkap
      </p>

      <p style={{ margin: '0 0 0', fontSize: 11, color: 'var(--kg-text-muted)', lineHeight: 1.6 }}>
        本ソフトは無償・無保証で提供されます。
        {ABOUT_LINKS.readme ? (
          <>
            {'詳しい利用条件は'}
            <a href={ABOUT_LINKS.readme} target="_blank" rel="noreferrer" style={linkStyle}>
              README
            </a>
            {'をご覧ください。'}
          </>
        ) : (
          '詳しい利用条件は README をご覧ください。'
        )}
      </p>

      {ABOUT_LINKS.donate && (
        <div style={{ marginTop: 20 }}>
          <a href={ABOUT_LINKS.donate} target="_blank" rel="noreferrer" style={donateLinkStyle}>
            開発を支援する
          </a>
        </div>
      )}
    </Modal>
  )
}

const linkStyle: React.CSSProperties = {
  color: 'var(--kg-accent)',
  textDecoration: 'none',
  margin: '0 2px'
}
const donateLinkStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--kg-text-muted)',
  textDecoration: 'none',
  borderBottom: '1px solid var(--kg-border)',
  paddingBottom: 1
}
