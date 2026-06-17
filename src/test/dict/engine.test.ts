import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'fs'
import { join } from 'path'
import { searchCandidates, mergeEntries } from '../../shared/dict/engine'
import { DictManager } from '../../shared/dict/DictManager'
import type { Dict } from '../../shared/dict/types'

const DICT: Dict = {
  'ろ': [{ word: '廬山昇龍覇', memo: '', count: 0 }],
  'ろざん': [
    { word: '廬山天竜爆裂覇', memo: '', count: 0 },
    { word: '廬山昇龍覇', memo: '', count: 0 },
  ],
  'てすと': [
    { word: 'テスト', memo: '', count: 0 },
    { word: '試験', memo: '', count: 0 },
  ],
  'あ': [{ word: '亜', memo: '', count: 0 }],
}

describe('searchCandidates', () => {
  it('最長一致を返す', () => {
    const result = searchCandidates('ろざん', DICT)
    expect(result?.reading).toBe('ろざん')
    expect(result?.candidates).toContain('廬山天竜爆裂覇')
  })

  it('長いキーがなければ短いキーにフォールバックする', () => {
    const result = searchCandidates('てすとんろ', DICT)
    expect(result?.reading).toBe('ろ')
  })

  it('maxLen より長いテキストは末尾だけを対象にする', () => {
    const result = searchCandidates('あいうえおかきくけこさしすせそてすと', DICT, 4)
    expect(result?.reading).toBe('てすと')
  })

  it('マッチしない場合は null を返す', () => {
    expect(searchCandidates('xyz', DICT)).toBeNull()
  })

  it('辞書が空の場合は null を返す', () => {
    expect(searchCandidates('ろ', {})).toBeNull()
  })

  it('テキストが空の場合は null を返す', () => {
    expect(searchCandidates('', DICT)).toBeNull()
  })

  it('maxLen ちょうどの読みにマッチする', () => {
    const result = searchCandidates('xxxxてすと', DICT, 3)
    expect(result?.reading).toBe('てすと')
  })

  it('カーソル直前の1文字にマッチする', () => {
    const result = searchCandidates('なにもないろ', DICT)
    expect(result?.reading).toBe('ろ')
  })

  it('candidates は string[] で返る', () => {
    const result = searchCandidates('てすと', DICT)
    expect(result?.candidates).toEqual(['テスト', '試験'])
  })
})

describe('mergeEntries', () => {
  it('重複なく追加する', () => {
    const existing = [{ word: '廬山昇龍覇', memo: '', count: 0 }]
    const result = mergeEntries(existing, ['廬山昇龍覇', '廬山天竜爆裂覇'])
    expect(result.map((e) => e.word)).toEqual(['廬山昇龍覇', '廬山天竜爆裂覇'])
  })

  it('既存エントリの memo/count を保持する', () => {
    const existing = [{ word: 'テスト', memo: 'メモ', count: 5 }]
    const result = mergeEntries(existing, ['テスト', '試験'])
    expect(result[0]).toEqual({ word: 'テスト', memo: 'メモ', count: 5 })
    expect(result[1]).toEqual({ word: '試験', memo: '', count: 0 })
  })

  it('既存リストを変更しない（イミュータブル）', () => {
    const original = [{ word: '亜', memo: '', count: 0 }]
    mergeEntries(original, ['阿'])
    expect(original).toHaveLength(1)
  })

  it('空リストへの追加', () => {
    const result = mergeEntries([], ['テスト'])
    expect(result).toEqual([{ word: 'テスト', memo: '', count: 0 }])
  })
})

// ── 旧フラット形式 → v1.0 自動移行テスト ────────────────────

describe('DictManager 旧形式の自動移行', () => {
  const tmpDir = join(process.cwd(), 'src/test/dict/__tmp_migrate__')

  beforeEach(() => {
    mkdirSync(tmpDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('旧フラット形式を読み込むと新形式に変換され .bak が残る', () => {
    const oldJson = JSON.stringify({ 'てすと': ['テスト', '試験'], 'あ': ['亜'] }, null, 2)
    writeFileSync(join(tmpDir, '旧辞書.json'), oldJson, 'utf-8')

    const manager = new DictManager(tmpDir)

    // in-memory が DictEntry[] 形式になっている
    const dict = manager.getDict('旧辞書')
    expect(dict['てすと']).toEqual([
      { word: 'テスト', memo: '', count: 0 },
      { word: '試験', memo: '', count: 0 },
    ])
    expect(dict['あ']).toEqual([{ word: '亜', memo: '', count: 0 }])

    // .bak が残っている
    expect(existsSync(join(tmpDir, '旧辞書.json.bak'))).toBe(true)

    // ディスクの .json が v1.0 形式になっている（即時保存済み）
    const saved = JSON.parse(readFileSync(join(tmpDir, '旧辞書.json'), 'utf-8'))
    expect(saved.schema_version).toBe(1)
    expect(saved.entries['てすと'][0].word).toBe('テスト')
  })
})
