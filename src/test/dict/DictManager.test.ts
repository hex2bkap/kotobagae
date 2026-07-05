import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdirSync, writeFileSync, existsSync, rmSync, readdirSync } from 'fs'
import { join } from 'path'
import { DictManager } from '../../shared/dict/DictManager'

// electron-log はテスト環境では不要なのでスタブ化
vi.mock('electron-log/main', () => ({ default: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

const TEST_DIR = join(import.meta.dirname, '__tmp_dict_manager__')

function freshManager(): DictManager {
  return new DictManager(TEST_DIR)
}

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true })
})

afterEach(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true })
})

describe('DictManager.createDict', () => {
  it('辞書を正常に作成しファイルが書き込まれる', () => {
    const dm = freshManager()
    const result = dm.createDict('test')
    expect(result).toBe(true)
    expect(dm.listDicts()).toContain('test')
    expect(existsSync(join(TEST_DIR, 'test.json'))).toBe(true)
  })

  it('同名辞書は false を返してストアを変えない', () => {
    const dm = freshManager()
    dm.createDict('dup')
    const result = dm.createDict('dup')
    expect(result).toBe(false)
    expect(dm.listDicts().filter((n) => n === 'dup').length).toBe(1)
  })

  it('saveFile が失敗した場合 store をロールバックして同名で再試行可能', () => {
    // 書き込み不可ファイルを置いてsaveFileを失敗させる
    const dm = freshManager()

    // TEST_DIR 内に書き込み不可の "fail.json" を用意（Windowsでは chmod 不可なので
    // ディレクトリ名と競合させて renameSync を失敗させる）
    mkdirSync(join(TEST_DIR, 'fail.json'), { recursive: true })

    expect(() => dm.createDict('fail')).toThrow()

    // ロールバック確認: store に 'fail' が残っていないこと
    expect(dm.listDicts()).not.toContain('fail')

    // 競合ディレクトリを除去して再試行できること
    rmSync(join(TEST_DIR, 'fail.json'), { recursive: true, force: true })
    const result = dm.createDict('fail')
    expect(result).toBe(true)
    expect(dm.listDicts()).toContain('fail')
  })
})

describe('DictManager.withSave rollback（addEntry 経由）', () => {
  it('saveFile が失敗した場合にエントリをロールバックする', () => {
    const dm = freshManager()
    dm.createDict('dict1')

    // ディレクトリ競合で saveFile を失敗させる
    rmSync(join(TEST_DIR, 'dict1.json'))
    mkdirSync(join(TEST_DIR, 'dict1.json'), { recursive: true })

    expect(() => dm.addEntry('dict1', 'てすと', ['テスト'])).toThrow()

    // ストアが空のままであること
    expect(dm.getDict('dict1')).toEqual({})
  })
})

describe('DictManager 正常系回帰', () => {
  it('createDict → addEntry → removeEntry が正しく動く', () => {
    const dm = freshManager()
    dm.createDict('normal')
    dm.addEntry('normal', 'てすと', ['テスト', '試験'])
    expect(Object.keys(dm.getDict('normal'))).toContain('てすと')
    dm.removeEntry('normal', 'てすと')
    expect(Object.keys(dm.getDict('normal'))).not.toContain('てすと')
  })

  it('renameDict がファイルを正しく移動する', () => {
    const dm = freshManager()
    dm.createDict('old')
    dm.addEntry('old', 'あ', ['亜'])
    dm.renameDict('old', 'new')
    expect(dm.listDicts()).toContain('new')
    expect(dm.listDicts()).not.toContain('old')
    expect(existsSync(join(TEST_DIR, 'new.json'))).toBe(true)
    expect(existsSync(join(TEST_DIR, 'old.json'))).toBe(false)
  })

  it('copyDict がエントリを独立してコピーする', () => {
    const dm = freshManager()
    dm.createDict('src')
    dm.addEntry('src', 'か', ['花'])
    dm.copyDict('src', 'dst')
    expect(dm.listDicts()).toContain('dst')
    // 独立性確認: src を変更しても dst は影響を受けない
    dm.addEntry('src', 'き', ['木'])
    expect(Object.keys(dm.getDict('dst'))).not.toContain('き')
  })

  it('flushDirty がカウントをファイルに書き出す', () => {
    const dm = freshManager()
    dm.createDict('usage')
    dm.addEntry('usage', 'あ', ['亜'])
    dm.recordUsage('usage', 'あ', '亜')
    dm.flushDirty()
    // 再読み込みで count が保存されていること
    const dm2 = freshManager()
    const entries = dm2.getDict('usage')['あ']
    expect(entries?.[0]?.count).toBe(1)
  })
})
