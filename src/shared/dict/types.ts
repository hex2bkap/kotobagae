export interface Dict {
  [reading: string]: string[]
}

export interface DictStore {
  [dictName: string]: Dict
}

export interface SearchResult {
  reading: string
  candidates: string[]
}
