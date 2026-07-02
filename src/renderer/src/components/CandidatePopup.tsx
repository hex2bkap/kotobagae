import { useEffect, useRef } from 'react'

interface Props {
  candidates: string[]
  selectedIndex: number
  position: { top: number; left: number }
  onSelect: (index: number) => void
}

export function CandidatePopup({ candidates, selectedIndex, position, onSelect }: Props): JSX.Element {
  const itemRefs = useRef<(HTMLDivElement | null)[]>([])
  const containerRef = useRef<HTMLDivElement>(null)

  // 選択行を常に表示範囲内に収める
  useEffect(() => {
    itemRefs.current[selectedIndex]?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  // 画面右端をはみ出す場合に left を補正
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const overflow = rect.right - window.innerWidth
    if (overflow > 0) {
      el.style.left = `${position.left - overflow - 4}px`
    }
  }, [position, candidates])

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        top: position.top,
        left: position.left,
        zIndex: 9999,
        background: 'var(--kg-bg-primary)',
        border: '1px solid var(--kg-border)',
        borderRadius: '4px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
        maxHeight: '320px',
        overflowY: 'auto',
        minWidth: '120px',
        fontSize: '15px',
        userSelect: 'none'
      }}
    >
      {candidates.map((c, i) => (
        <div
          key={i}
          ref={(el) => { itemRefs.current[i] = el }}
          onMouseDown={(e) => {
            e.preventDefault() // エディタのフォーカスを奪わない
            onSelect(i)
          }}
          style={{
            padding: '4px 12px',
            cursor: 'pointer',
            background: i === selectedIndex ? 'var(--kg-accent)' : 'transparent',
            color: i === selectedIndex ? 'var(--kg-bg-primary)' : 'var(--kg-text-primary)',
            whiteSpace: 'nowrap'
          }}
        >
          {c}
        </div>
      ))}
    </div>
  )
}
