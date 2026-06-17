import type { Dict, DictEntry, SearchResult } from './types'

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
    const entries = dict[reading]
    if (entries && entries.length > 0) {
      return { reading, candidates: entries.map((e) => e.word) }
    }
  }

  return null
}

/**
 * エントリリストに word をキーとして重複なくマージする（イミュータブル）。
 * 既存エントリの memo/count は保持し、新規 word のみ { word, memo:'', count:0 } で追加する。
 */
export function mergeEntries(existing: DictEntry[], additions: string[]): DictEntry[] {
  const result = [...existing]
  for (const word of additions) {
    if (!result.some((e) => e.word === word)) {
      result.push({ word, memo: '', count: 0 })
    }
  }
  return result
}
