export interface DictEntry {
  word: string
  memo: string
  count: number
}

// in-memory: 読み → エントリ配列
export type Dict = Record<string, DictEntry[]>

// on-disk v1.0（仕様 §7.1）
export interface DictFileV1 {
  schema_version: 1
  name: string
  entries: Dict
}

export interface DictStore {
  [dictName: string]: Dict
}

export interface SearchResult {
  reading: string
  candidates: string[]
}
