import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, unlinkSync, renameSync } from 'fs'
import { join } from 'path'
import type { Dict, DictEntry, DictFileV1, DictStore } from './types'
import { mergeEntries } from './engine'

export class DictManager {
  private readonly dir: string
  private store: DictStore = {}

  constructor(dictsDir: string) {
    this.dir = dictsDir
    mkdirSync(dictsDir, { recursive: true })
    this.loadAll()
  }

  // ── 読み込み ────────────────────────────────────────────────

  private loadAll(): void {
    this.store = {}
    if (!existsSync(this.dir)) return
    for (const fname of readdirSync(this.dir)) {
      if (!fname.endsWith('.json')) continue
      const name = fname.slice(0, -5)
      const { dict, migrated } = this.loadFile(join(this.dir, fname))
      this.store[name] = dict
      // 旧形式だった場合は即時アトミック保存（起動時につき一度だけ）
      if (migrated) this.saveFile(name)
    }
  }

  private loadFile(filePath: string): { dict: Dict; migrated: boolean } {
    try {
      const raw = readFileSync(filePath, 'utf-8')
      const parsed = JSON.parse(raw)

      if (parsed.schema_version === 1) {
        return { dict: parsed.entries as Dict, migrated: false }
      }

      // 旧フラット形式 → .bak を残してから変換
      writeFileSync(`${filePath}.bak`, raw, 'utf-8')
      return { dict: migrateFlat(parsed as Record<string, string[]>), migrated: true }
    } catch {
      return { dict: {}, migrated: false }
    }
  }

  // ── 保存（tmp → renameSync のアトミック書き込み）──────────

  private saveFile(name: string): void {
    const path = join(this.dir, `${name}.json`)
    const tmp = `${path}.tmp`
    const payload: DictFileV1 = {
      schema_version: 1,
      name,
      entries: this.store[name]
    }
    writeFileSync(tmp, JSON.stringify(payload, null, 2), 'utf-8')
    renameSync(tmp, path)
  }

  // ── 辞書一覧・操作 ─────────────────────────────────────────

  listDicts(): string[] {
    return Object.keys(this.store).sort()
  }

  getDict(name: string): Dict {
    return this.store[name] ?? {}
  }

  createDict(name: string): boolean {
    if (name in this.store) return false
    this.store[name] = {}
    this.saveFile(name)
    return true
  }

  deleteDict(name: string): void {
    if (!(name in this.store)) return
    delete this.store[name]
    try { unlinkSync(join(this.dir, `${name}.json`)) } catch { /* 無視 */ }
  }

  renameDict(oldName: string, newName: string): boolean {
    if (!(oldName in this.store) || newName in this.store) return false
    this.store[newName] = this.store[oldName]
    delete this.store[oldName]
    this.saveFile(newName)
    try { unlinkSync(join(this.dir, `${oldName}.json`)) } catch { /* 無視 */ }
    return true
  }

  copyDict(srcName: string, dstName: string): boolean {
    if (!(srcName in this.store) || dstName in this.store) return false
    this.store[dstName] = Object.fromEntries(
      Object.entries(this.store[srcName]).map(([k, v]) => [k, v.map((e) => ({ ...e }))])
    )
    this.saveFile(dstName)
    return true
  }

  // ── 辞書データ取得 ─────────────────────────────────────────

  getDictData(name: string): Dict {
    return this.store[name] ?? {}
  }

  // ── エントリ操作 ────────────────────────────────────────────

  addEntry(dictName: string, reading: string, words: string[]): void {
    if (!(dictName in this.store)) return
    const existing = this.store[dictName][reading] ?? []
    this.store[dictName][reading] = mergeEntries(existing, words)
    this.saveFile(dictName)
  }

  removeEntry(dictName: string, reading: string): void {
    if (!(dictName in this.store)) return
    delete this.store[dictName][reading]
    this.saveFile(dictName)
  }

  updateEntry(
    dictName: string,
    reading: string,
    index: number,
    patch: { word?: string; memo?: string; count?: number }
  ): boolean {
    const entries = this.store[dictName]?.[reading]
    if (!entries || index < 0 || index >= entries.length) return false
    if (patch.word !== undefined && patch.word !== entries[index].word) {
      if (entries.some((e, i) => i !== index && e.word === patch.word)) return false
    }
    entries[index] = { ...entries[index], ...patch }
    this.saveFile(dictName)
    return true
  }

  removeCandidate(dictName: string, reading: string, index: number): void {
    const dict = this.store[dictName]
    if (!dict) return
    const entries = dict[reading]
    if (!entries || index < 0 || index >= entries.length) return
    entries.splice(index, 1)
    if (entries.length === 0) delete dict[reading]
    this.saveFile(dictName)
  }

  addCandidate(dictName: string, reading: string, word: string): boolean {
    if (!(dictName in this.store)) return false
    if (!this.store[dictName][reading]) this.store[dictName][reading] = []
    const existing = this.store[dictName][reading]
    if (existing.some((e) => e.word === word)) return false
    existing.push({ word, memo: '', count: 0 })
    this.saveFile(dictName)
    return true
  }

  renameReading(dictName: string, oldReading: string, newReading: string): boolean {
    const dict = this.store[dictName]
    if (!dict || !(oldReading in dict) || newReading in dict) return false
    dict[newReading] = dict[oldReading]
    delete dict[oldReading]
    this.saveFile(dictName)
    return true
  }

  removeReading(dictName: string, reading: string): void {
    const dict = this.store[dictName]
    if (!dict || !(reading in dict)) return
    delete dict[reading]
    this.saveFile(dictName)
  }

  // ── TSV エクスポート ────────────────────────────────────────

  exportTsv(tsvPath: string, dictName: string): number {
    if (!(dictName in this.store)) return 0
    const lines: string[] = []
    for (const [reading, entries] of Object.entries(this.store[dictName]).sort()) {
      for (const entry of entries) {
        lines.push(`${reading}\t${entry.word}\t名詞\t\n`)
      }
    }
    // UTF-8 BOM 付き（MS-IME / Google 日本語入力との互換性）
    writeFileSync(tsvPath, '﻿' + lines.join(''), 'utf-8')
    return lines.length
  }

  // ── TSV インポート ──────────────────────────────────────────

  importTsv(tsvPath: string, dictName: string): number {
    if (!(dictName in this.store)) {
      this.store[dictName] = {}
    }
    const raw = readFileSync(tsvPath)
    let text: string
    try {
      text = raw.toString('utf-8').replace(/^﻿/, '')
    } catch {
      text = raw.toString('latin1')
    }

    let count = 0
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('!')) continue
      const parts = trimmed.split('\t')
      if (parts.length < 2) continue
      const reading = parts[0].trim()
      const word = parts[1].trim()
      if (!reading || !word) continue
      const existing = this.store[dictName][reading] ?? []
      if (!existing.some((e) => e.word === word)) {
        existing.push({ word, memo: '', count: 0 })
        this.store[dictName][reading] = existing
        count++
      }
    }
    if (count > 0) this.saveFile(dictName)
    return count
  }
}

// ── 旧フラット形式変換ヘルパー ──────────────────────────────

function migrateFlat(old: Record<string, string[]>): Dict {
  const entries: Dict = {}
  for (const [reading, words] of Object.entries(old)) {
    if (Array.isArray(words)) {
      entries[reading] = words.map((w): DictEntry => ({ word: String(w), memo: '', count: 0 }))
    }
  }
  return entries
}
