import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'fs'
import { join } from 'path'
import { searchCandidates, mergeEntries, sortCandidates, searchMultiDicts } from '../../shared/dict/engine'
import { DictManager } from '../../shared/dict/DictManager'
import type { Dict } from '../../shared/dict/types'

const DICT: Dict = {
  'こ': [{ word: 'コトバガエ', memo: '', count: 0 }],
  'こと': [
    { word: 'kotobagae', memo: '', count: 0 },
    { word: 'コトバガエ', memo: '', count: 0 },
  ],
  'てすと': [
    { word: 'テスト', memo: '', count: 0 },
    { word: '試験', memo: '', count: 0 },
  ],
  'あ': [{ word: '亜', memo: '', count: 0 }],
}

describe('searchCandidates', () => {
  it('最長一致を返す', () => {
    const result = searchCandidates('こと', DICT)
    expect(result?.reading).toBe('こと')
    expect(result?.candidates).toContain('kotobagae')
  })

  it('長いキーがなければ短いキーにフォールバックする', () => {
    const result = searchCandidates('てすとんこ', DICT)
    expect(result?.reading).toBe('こ')
  })

  it('maxLen より長いテキストは末尾だけを対象にする', () => {
    const result = searchCandidates('あいうえおかきくけこさしすせそてすと', DICT, 4)
    expect(result?.reading).toBe('てすと')
  })

  it('マッチしない場合は null を返す', () => {
    expect(searchCandidates('xyz', DICT)).toBeNull()
  })

  it('辞書が空の場合は null を返す', () => {
    expect(searchCandidates('こ', {})).toBeNull()
  })

  it('テキストが空の場合は null を返す', () => {
    expect(searchCandidates('', DICT)).toBeNull()
  })

  it('maxLen ちょうどの読みにマッチする', () => {
    const result = searchCandidates('xxxxてすと', DICT, 3)
    expect(result?.reading).toBe('てすと')
  })

  it('カーソル直前の1文字にマッチする', () => {
    const result = searchCandidates('なにもないこ', DICT)
    expect(result?.reading).toBe('こ')
  })

  it('candidates は string[] で返る', () => {
    const result = searchCandidates('てすと', DICT)
    expect(result?.candidates).toEqual(['テスト', '試験'])
  })
})

describe('mergeEntries', () => {
  it('重複なく追加する', () => {
    const existing = [{ word: 'コトバガエ', memo: '', count: 0 }]
    const result = mergeEntries(existing, ['コトバガエ', 'kotobagae'])
    expect(result.map((e) => e.word)).toEqual(['コトバガエ', 'kotobagae'])
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

// ── DictManager 管理操作テスト ───────────────────────────────

describe('DictManager 管理操作', () => {
  const tmpDir = join(process.cwd(), 'src/test/dict/__tmp_manage__')

  beforeEach(() => {
    mkdirSync(tmpDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('updateEntry: word を変更できる', () => {
    const manager = new DictManager(tmpDir)
    manager.createDict('test')
    manager.addEntry('test', 'てすと', ['テスト'])
    const ok = manager.updateEntry('test', 'てすと', 0, { word: '試験' })
    expect(ok).toBe(true)
    expect(manager.getDict('test')['てすと'][0].word).toBe('試験')
  })

  it('updateEntry: memo を変更できる', () => {
    const manager = new DictManager(tmpDir)
    manager.createDict('test')
    manager.addEntry('test', 'てすと', ['テスト'])
    manager.updateEntry('test', 'てすと', 0, { memo: 'キャラ設定' })
    expect(manager.getDict('test')['てすと'][0].memo).toBe('キャラ設定')
  })

  it('updateEntry: 同じ word が既にあれば false を返す', () => {
    const manager = new DictManager(tmpDir)
    manager.createDict('test')
    manager.addEntry('test', 'てすと', ['テスト', '試験'])
    const ok = manager.updateEntry('test', 'てすと', 0, { word: '試験' })
    expect(ok).toBe(false)
  })

  it('removeCandidate: 候補を1件削除できる', () => {
    const manager = new DictManager(tmpDir)
    manager.createDict('test')
    manager.addEntry('test', 'てすと', ['テスト', '試験'])
    manager.removeCandidate('test', 'てすと', 0)
    const entries = manager.getDict('test')['てすと']
    expect(entries).toHaveLength(1)
    expect(entries[0].word).toBe('試験')
  })

  it('removeCandidate: 最後の候補を削除すると読みごと消える', () => {
    const manager = new DictManager(tmpDir)
    manager.createDict('test')
    manager.addEntry('test', 'てすと', ['テスト'])
    manager.removeCandidate('test', 'てすと', 0)
    expect(manager.getDict('test')['てすと']).toBeUndefined()
  })

  it('addCandidate: 新規候補を追加できる', () => {
    const manager = new DictManager(tmpDir)
    manager.createDict('test')
    manager.addEntry('test', 'てすと', ['テスト'])
    const ok = manager.addCandidate('test', 'てすと', '試験')
    expect(ok).toBe(true)
    expect(manager.getDict('test')['てすと']).toHaveLength(2)
  })

  it('addCandidate: 重複は追加しない', () => {
    const manager = new DictManager(tmpDir)
    manager.createDict('test')
    manager.addEntry('test', 'てすと', ['テスト'])
    const ok = manager.addCandidate('test', 'てすと', 'テスト')
    expect(ok).toBe(false)
    expect(manager.getDict('test')['てすと']).toHaveLength(1)
  })

  it('renameReading: 読みを変更できる', () => {
    const manager = new DictManager(tmpDir)
    manager.createDict('test')
    manager.addEntry('test', 'てすと', ['テスト'])
    const ok = manager.renameReading('test', 'てすと', 'ためし')
    expect(ok).toBe(true)
    expect(manager.getDict('test')['ためし']).toBeDefined()
    expect(manager.getDict('test')['てすと']).toBeUndefined()
  })

  it('renameReading: 新しい読みが既にあれば false を返す', () => {
    const manager = new DictManager(tmpDir)
    manager.createDict('test')
    manager.addEntry('test', 'てすと', ['テスト'])
    manager.addEntry('test', 'ためし', ['試し'])
    const ok = manager.renameReading('test', 'てすと', 'ためし')
    expect(ok).toBe(false)
  })

  it('removeReading: 読みを削除できる', () => {
    const manager = new DictManager(tmpDir)
    manager.createDict('test')
    manager.addEntry('test', 'てすと', ['テスト'])
    manager.addEntry('test', 'あ', ['亜'])
    manager.removeReading('test', 'てすと')
    expect(manager.getDict('test')['てすと']).toBeUndefined()
    expect(manager.getDict('test')['あ']).toBeDefined()
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

// ── sortCandidates テスト ──────────────────────────────────────────

// ── searchMultiDicts テスト ─────────────────────────────────────────────────

describe('searchMultiDicts', () => {
  const dictA: import('../../shared/dict/types').Dict = {
    'てすと': [
      { word: 'テスト', memo: '', count: 3 },
      { word: '試験', memo: '', count: 1 }
    ]
  }
  const dictB: import('../../shared/dict/types').Dict = {
    'てすと': [
      { word: '検定', memo: '', count: 5 },
      { word: 'テスト', memo: '', count: 0 }  // dictA と重複
    ],
    'ろ': [{ word: '路', memo: '', count: 0 }]
  }

  it('単一辞書でマッチする', () => {
    const result = searchMultiDicts('てすと', [{ name: 'A', dict: dictA }])
    expect(result?.reading).toBe('てすと')
    expect(result?.candidates.map((c) => c.word)).toContain('テスト')
  })

  it('複数辞書をマージし優先度順に返す', () => {
    const result = searchMultiDicts('てすと', [
      { name: 'A', dict: dictA },
      { name: 'B', dict: dictB }
    ], 10, false)
    expect(result?.reading).toBe('てすと')
    // A が優先なので A の候補が先
    expect(result?.candidates[0].word).toBe('テスト')
    expect(result?.candidates[0].dictName).toBe('A')
    expect(result?.candidates[1].word).toBe('試験')
    expect(result?.candidates[1].dictName).toBe('A')
    // 検定は B 由来（重複なし）
    expect(result?.candidates[2].word).toBe('検定')
    expect(result?.candidates[2].dictName).toBe('B')
  })

  it('同語は優先度の高い辞書のものだけ残す（dictB が優先の場合）', () => {
    const result = searchMultiDicts('てすと', [
      { name: 'B', dict: dictB },
      { name: 'A', dict: dictA }
    ], 10, false)
    const words = result!.candidates.map((c) => c.word)
    const testEntries = result!.candidates.filter((c) => c.word === 'テスト')
    expect(testEntries).toHaveLength(1)
    expect(testEntries[0].dictName).toBe('B')
    // 登録順: B の検定(0), テスト(1), A の試験(後)
    expect(words[0]).toBe('検定')
  })

  it('byFrequency=true: 辞書優先度内でcount降順に並ぶ', () => {
    const result = searchMultiDicts('てすと', [
      { name: 'A', dict: dictA },
      { name: 'B', dict: dictB }
    ], 10, true)
    // A が優先なので A の候補が先。A 内では count 降順: テスト(3) → 試験(1)
    expect(result?.candidates[0].word).toBe('テスト')
    expect(result?.candidates[0].dictName).toBe('A')
    expect(result?.candidates[1].word).toBe('試験')
    // B の検定(count=5)は A 全体の後
    expect(result?.candidates[2].word).toBe('検定')
    expect(result?.candidates[2].dictName).toBe('B')
  })

  it('辞書リストが空なら null を返す', () => {
    expect(searchMultiDicts('てすと', [])).toBeNull()
  })

  it('マッチしない場合は null を返す', () => {
    expect(searchMultiDicts('xyz', [{ name: 'A', dict: dictA }])).toBeNull()
  })

  it('由来辞書名が結果に含まれる', () => {
    const result = searchMultiDicts('ろ', [{ name: 'B', dict: dictB }])
    expect(result?.candidates[0].dictName).toBe('B')
  })
})

describe('sortCandidates', () => {
  const entries = [
    { word: 'テスト', memo: '', count: 3 },
    { word: '試験', memo: '', count: 5 },
    { word: '検定', memo: '', count: 3 },
    { word: '試み', memo: '', count: 0 },
  ]

  it('byFrequency=true: count 降順で返る', () => {
    const result = sortCandidates(entries, true)
    expect(result[0]).toBe('試験')
  })

  it('byFrequency=true: 同数は登録順でタイブレーク', () => {
    const result = sortCandidates(entries, true)
    // テスト(3)・検定(3) は登録順でテストが先
    expect(result[1]).toBe('テスト')
    expect(result[2]).toBe('検定')
  })

  it('byFrequency=false: 登録順のまま返る', () => {
    const result = sortCandidates(entries, false)
    expect(result).toEqual(['テスト', '試験', '検定', '試み'])
  })

  it('元の配列を変更しない（イミュータブル）', () => {
    sortCandidates(entries, true)
    expect(entries[0].word).toBe('テスト')
  })
})
