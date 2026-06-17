import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, unlinkSync } from 'fs'
import { join } from 'path'
import type { Dict, DictStore } from './types'
import { mergeCandidates } from './engine'

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
      this.store[name] = this.loadFile(fname)
    }
  }

  private loadFile(fname: string): Dict {
    try {
      const raw = readFileSync(join(this.dir, fname), 'utf-8')
      return JSON.parse(raw) as Dict
    } catch {
      return {}
    }
  }

  // ── 保存（一時ファイル → リネームのアトミック書き込み）─────

  private saveFile(name: string): void {
    const path = join(this.dir, `${name}.json`)
    const tmp = `${path}.tmp`
    writeFileSync(tmp, JSON.stringify(this.store[name], null, 2), 'utf-8')
    // Windows では rename 前に対象が存在する場合は先に削除が必要
    if (existsSync(path)) unlinkSync(path)
    // fs.renameSync の代わりに writeFileSync で上書き（Node の rename は同一ボリューム前提）
    writeFileSync(path, JSON.stringify(this.store[name], null, 2), 'utf-8')
    try { unlinkSync(tmp) } catch { /* tmp が残っても問題なし */ }
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
      Object.entries(this.store[srcName]).map(([k, v]) => [k, [...v]])
    )
    this.saveFile(dstName)
    return true
  }

  // ── エントリ操作 ────────────────────────────────────────────

  addEntry(dictName: string, reading: string, candidates: string[]): void {
    if (!(dictName in this.store)) return
    const existing = this.store[dictName][reading] ?? []
    this.store[dictName][reading] = mergeCandidates(existing, candidates)
    this.saveFile(dictName)
  }

  removeEntry(dictName: string, reading: string): void {
    if (!(dictName in this.store)) return
    delete this.store[dictName][reading]
    this.saveFile(dictName)
  }

  // ── TSV エクスポート ────────────────────────────────────────

  exportTsv(tsvPath: string, dictName: string): number {
    if (!(dictName in this.store)) return 0
    const lines: string[] = []
    for (const [reading, candidates] of Object.entries(this.store[dictName]).sort()) {
      for (const candidate of candidates) {
        lines.push(`${reading}\t${candidate}\t名詞\t\n`)
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
    // UTF-8 BOM → UTF-8 → cp932 の順で試みる
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
      const candidate = parts[1].trim()
      if (!reading || !candidate) continue
      const existing = this.store[dictName][reading] ?? []
      if (!existing.includes(candidate)) {
        existing.push(candidate)
        this.store[dictName][reading] = existing
        count++
      }
    }
    if (count > 0) this.saveFile(dictName)
    return count
  }
}
