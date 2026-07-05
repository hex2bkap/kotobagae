import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, unlinkSync, renameSync } from 'fs'
import { join } from 'path'
import log from 'electron-log/main'
import type { Dict, DictEntry, DictFileV1, DictStore } from './types'
import { mergeEntries } from './engine'

export class DictManager {
  private readonly dir: string
  private store: DictStore = {}
  private dirty: Set<string> = new Set()

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
      if (migrated) {
        try { this.saveFile(name) } catch { /* already logged in saveFile */ }
      }
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
    try {
      writeFileSync(tmp, JSON.stringify(payload, null, 2), 'utf-8')
      renameSync(tmp, path)
    } catch (e) {
      const err = e as NodeJS.ErrnoException
      log.error('[DictManager] saveFile failed', {
        dictName: name,
        path,
        code: err.code,
        errno: err.errno,
        message: err.message
      })
      try { unlinkSync(tmp) } catch { /* ignore */ }
      throw e
    }
  }

  // 既存辞書への変更で「変更→保存失敗→ロールバック」を統一するヘルパー
  private withSave<T>(name: string, mutate: () => T): T {
    const snapshot: Dict = JSON.parse(JSON.stringify(this.store[name]))
    const result = mutate()
    try {
      this.saveFile(name)
      return result
    } catch (e) {
      this.store[name] = snapshot
      throw e
    }
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
    try {
      this.saveFile(name)
      return true
    } catch (e) {
      delete this.store[name]
      throw e
    }
  }

  deleteDict(name: string): void {
    if (!(name in this.store)) return
    delete this.store[name]
    try { unlinkSync(join(this.dir, `${name}.json`)) } catch { /* 無視 */ }
  }

  renameDict(oldName: string, newName: string): boolean {
    if (!(oldName in this.store) || newName in this.store) return false
    const data = this.store[oldName]
    this.store[newName] = data
    delete this.store[oldName]
    try {
      this.saveFile(newName)
      try { unlinkSync(join(this.dir, `${oldName}.json`)) } catch { /* 無視 */ }
      return true
    } catch (e) {
      this.store[oldName] = data
      delete this.store[newName]
      throw e
    }
  }

  copyDict(srcName: string, dstName: string): boolean {
    if (!(srcName in this.store) || dstName in this.store) return false
    this.store[dstName] = Object.fromEntries(
      Object.entries(this.store[srcName]).map(([k, v]) => [k, v.map((e) => ({ ...e }))])
    )
    try {
      this.saveFile(dstName)
      return true
    } catch (e) {
      delete this.store[dstName]
      throw e
    }
  }

  // ── 使用頻度記録（バッチ保存） ────────────────────────────────

  recordUsage(dictName: string, reading: string, word: string): void {
    const entries = this.store[dictName]?.[reading]
    if (!entries) return
    const entry = entries.find((e) => e.word === word)
    if (!entry) return
    entry.count++
    this.dirty.add(dictName)
  }

  flushDirty(): void {
    for (const name of this.dirty) {
      if (name in this.store) {
        try { this.saveFile(name) } catch { /* already logged in saveFile */ }
      }
    }
    this.dirty.clear()
  }

  // ── 辞書データ取得 ─────────────────────────────────────────

  getDictData(name: string): Dict {
    return this.store[name] ?? {}
  }

  // ── エントリ操作 ────────────────────────────────────────────

  addEntry(dictName: string, reading: string, words: string[]): void {
    if (!(dictName in this.store)) return
    this.withSave(dictName, () => {
      const existing = this.store[dictName][reading] ?? []
      this.store[dictName][reading] = mergeEntries(existing, words)
    })
  }

  removeEntry(dictName: string, reading: string): void {
    if (!(dictName in this.store)) return
    this.withSave(dictName, () => {
      delete this.store[dictName][reading]
    })
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
    return this.withSave(dictName, () => {
      entries[index] = { ...entries[index], ...patch }
      return true
    })
  }

  removeCandidate(dictName: string, reading: string, index: number): void {
    const dict = this.store[dictName]
    if (!dict) return
    const entries = dict[reading]
    if (!entries || index < 0 || index >= entries.length) return
    this.withSave(dictName, () => {
      entries.splice(index, 1)
      if (entries.length === 0) delete dict[reading]
    })
  }

  addCandidate(dictName: string, reading: string, word: string): boolean {
    if (!(dictName in this.store)) return false
    if (!this.store[dictName][reading]) this.store[dictName][reading] = []
    const existing = this.store[dictName][reading]
    if (existing.some((e) => e.word === word)) return false
    return this.withSave(dictName, () => {
      existing.push({ word, memo: '', count: 0 })
      return true
    })
  }

  renameReading(dictName: string, oldReading: string, newReading: string): boolean {
    const dict = this.store[dictName]
    if (!dict || !(oldReading in dict) || newReading in dict) return false
    return this.withSave(dictName, () => {
      dict[newReading] = dict[oldReading]
      delete dict[oldReading]
      return true
    })
  }

  removeReading(dictName: string, reading: string): void {
    const dict = this.store[dictName]
    if (!dict || !(reading in dict)) return
    this.withSave(dictName, () => {
      delete dict[reading]
    })
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
    const wasNew = !(dictName in this.store)
    if (wasNew) {
      this.store[dictName] = {}
    }
    const snapshot: Dict = JSON.parse(JSON.stringify(this.store[dictName]))
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
    if (count > 0) {
      try {
        this.saveFile(dictName)
      } catch (e) {
        if (wasNew) {
          delete this.store[dictName]
        } else {
          this.store[dictName] = snapshot
        }
        throw e
      }
    }
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
