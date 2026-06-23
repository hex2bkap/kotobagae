import type { Dict, DictEntry, SearchResult, CandidateWithSource, MultiSearchResult } from './types'

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
 * エントリを count 降順（同数は登録順）でソートして word[] を返す。
 * byFrequency=false のときは登録順のまま返す。
 */
export function sortCandidates(entries: DictEntry[], byFrequency: boolean): string[] {
  if (!byFrequency) return entries.map((e) => e.word)
  return entries
    .map((e, i) => ({ e, i }))
    .sort((a, b) => b.e.count - a.e.count || a.i - b.i)
    .map(({ e }) => e.word)
}

/**
 * 複数辞書を横断して最長一致で候補を検索する。
 * dicts は優先度順（先頭が最優先）。
 * マージ規則: 辞書優先度 → count降順 → 登録順。同語は優先辞書のものだけ残す。
 */
export function searchMultiDicts(
  textBeforeCursor: string,
  dicts: Array<{ name: string; dict: Dict }>,
  maxLen: number = 10,
  byFrequency: boolean = true
): MultiSearchResult | null {
  if (!textBeforeCursor || dicts.length === 0) return null

  const tail =
    textBeforeCursor.length > maxLen
      ? textBeforeCursor.slice(-maxLen)
      : textBeforeCursor

  for (let length = tail.length; length >= 1; length--) {
    const reading = tail.slice(-length)

    // 全辞書から (辞書優先度, 登録順, entry, dictName) を収集
    const collected: Array<{
      dictPriIdx: number
      regIdx: number
      entry: DictEntry
      dictName: string
    }> = []

    for (let i = 0; i < dicts.length; i++) {
      const { name, dict } = dicts[i]
      const entries = dict[reading]
      if (entries && entries.length > 0) {
        for (let j = 0; j < entries.length; j++) {
          collected.push({ dictPriIdx: i, regIdx: j, entry: entries[j], dictName: name })
        }
      }
    }

    if (collected.length === 0) continue

    // ソート: 辞書優先度昇順 → count降順（byFrequency時） → 登録順昇順
    collected.sort((a, b) => {
      if (a.dictPriIdx !== b.dictPriIdx) return a.dictPriIdx - b.dictPriIdx
      if (byFrequency && a.entry.count !== b.entry.count) return b.entry.count - a.entry.count
      return a.regIdx - b.regIdx
    })

    // 同語は最優先辞書のものだけ残す
    const seen = new Set<string>()
    const candidates: CandidateWithSource[] = []
    for (const item of collected) {
      if (!seen.has(item.entry.word)) {
        seen.add(item.entry.word)
        candidates.push({ word: item.entry.word, dictName: item.dictName })
      }
    }

    return { reading, candidates }
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
