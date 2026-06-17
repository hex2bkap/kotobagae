import { describe, it, expect } from 'vitest'
import { searchCandidates, mergeCandidates } from '../../shared/dict/engine'
import type { Dict } from '../../shared/dict/types'

const DICT: Dict = {
  'ろ': ['廬山昇龍覇'],
  'ろざん': ['廬山天竜爆裂覇', '廬山昇龍覇'],
  'てすと': ['テスト', '試験'],
  'あ': ['亜'],
}

describe('searchCandidates', () => {
  it('最長一致を返す', () => {
    const result = searchCandidates('ろざん', DICT)
    expect(result?.reading).toBe('ろざん')
    expect(result?.candidates).toContain('廬山天竜爆裂覇')
  })

  it('長いキーがなければ短いキーにフォールバックする', () => {
    // 末尾が「ろ」、その前の「んろ」「うんろ」等はないので「ろ」にマッチ
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
})

describe('mergeCandidates', () => {
  it('重複なく追加する', () => {
    const result = mergeCandidates(['廬山昇龍覇'], ['廬山昇龍覇', '廬山天竜爆裂覇'])
    expect(result).toEqual(['廬山昇龍覇', '廬山天竜爆裂覇'])
  })

  it('既存リストを変更しない（イミュータブル）', () => {
    const original = ['亜']
    mergeCandidates(original, ['阿'])
    expect(original).toEqual(['亜'])
  })

  it('空リストへの追加', () => {
    expect(mergeCandidates([], ['テスト'])).toEqual(['テスト'])
  })
})
