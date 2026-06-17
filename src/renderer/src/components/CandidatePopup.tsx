import { useEffect, useRef } from 'react'

interface Props {
  candidates: string[]
  selectedIndex: number
  position: { top: number; left: number }
  onSelect: (index: number) => void
}

export function CandidatePopup({ candidates, selectedIndex, position, onSelect }: Props): JSX.Element {
  const itemRefs = useRef<(HTMLDivElement | null)[]>([])

  // 選択行を常に表示範囲内に収める
  useEffect(() => {
    itemRefs.current[selectedIndex]?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  return (
    <div
      style={{
        position: 'fixed',
        top: position.top,
        left: position.left,
        zIndex: 9999,
        background: '#fff',
        border: '1px solid #bbb',
        borderRadius: '4px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
        maxHeight: '320px',
        overflowY: 'auto',
        minWidth: '120px',
        fontFamily: '"Yu Gothic UI", "Meiryo", sans-serif',
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
            background: i === selectedIndex ? '#4a90d9' : 'transparent',
            color: i === selectedIndex ? '#fff' : '#222',
            whiteSpace: 'nowrap'
          }}
        >
          {c}
        </div>
      ))}
    </div>
  )
}
