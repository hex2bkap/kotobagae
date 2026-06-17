import type { Dict, SearchResult } from './types'

/**
 * カーソル直前テキストから最長一致で候補を検索する。
 * maxLen 文字から 1 文字まで長い順に試し、最初にヒットしたものを返す。
 */
export function searchCandidates(
  textBeforeCursor: string,
  dict: Dict,
  maxLen: number = 10
): SearchResult | null {
  if (!textBeforeCursor || Object.keys(dict).length === 0) return null

  const tail =
    textBeforeCursor.length > maxLen
      ? textBeforeCursor.slice(-maxLen)
      : textBeforeCursor

  for (let length = tail.length; length >= 1; length--) {
    const reading = tail.slice(-length)
    const candidates = dict[reading]
    if (candidates && candidates.length > 0) {
      return { reading, candidates }
    }
  }

  return null
}

/**
 * 候補リストに重複なく候補を追加したものを返す（イミュータブル）。
 */
export function mergeCandidates(existing: string[], additions: string[]): string[] {
  const result = [...existing]
  for (const c of additions) {
    if (!result.includes(c)) result.push(c)
  }
  return result
}
