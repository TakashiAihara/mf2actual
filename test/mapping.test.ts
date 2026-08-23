import { describe, expect, test } from 'bun:test'

import { resolve } from '../src/mapping.ts'
import type { Mapping, MfTransaction } from '../src/types.ts'

function tx(over: Partial<MfTransaction> = {}): MfTransaction {
  return {
    id: '1',
    date: '2026-07-01',
    amount: -1000,
    account: 'サンプルカード ( 名義 )',
    category: { largeId: '1', largeName: '食費', middleId: '2', middleName: '食料品' },
    memo: null,
    title: 'スーパーＡ',
    isTransfer: false,
    isManualEntry: false,
    ...over,
  }
}

const mapping: Mapping = {
  accounts: { 'サンプルカード ( 名義 )': 'メインカード', '': '-' },
  categories: { '食費/食料品': '食費/日常食', '日用品/日用品': '日用品/日用品', '現金・カード/ATM引き出し': '-' },
  overrides: [
    { titleContains: 'Ａｍａｚｏｎ Ｍａｒｋｅｔ', to: '食費/Amazon' },
    { large: '日用品', titleContains: 'スーパーＢ', to: '食費/日常食' },
  ],
}

describe('resolve', () => {
  test('カテゴリマッピングを引く', () => {
    const r = resolve(tx(), mapping)
    expect(r.categoryName).toBe('食費/日常食')
    expect(r.accountName).toBe('メインカード')
    expect(r.excluded).toBeNull()
  })

  test('override はカテゴリマッピングより優先される', () => {
    // 全角スペースの生 title に対し、マッピング側は半角スペースで書いてある。
    // 両側を正規化して比較していないと、ここが黙って素通りする。
    const r = resolve(tx({ title: 'Ａｍａｚｏｎ　Ｍａｒｋｅｔ　Ｐｌａｃｅ' }), mapping)
    expect(r.categoryName).toBe('食費/Amazon')
  })

  test('large 条件付きの override は他カテゴリに波及しない', () => {
    const nichiyo = { largeId: '3', largeName: '日用品', middleId: '4', middleName: '日用品' }
    expect(resolve(tx({ category: nichiyo, title: 'スーパーＢオンラインチャージ' }), mapping).categoryName).toBe(
      '食費/日常食',
    )
    // 同じ日用品でも別の店なら日用品のまま
    expect(resolve(tx({ category: nichiyo, title: 'ホームセンターＤ' }), mapping).categoryName).toBe(
      '日用品/日用品',
    )
  })

  test('除外指定のカテゴリは excluded になる', () => {
    const cash = { largeId: '9', largeName: '現金・カード', middleId: '9', middleName: 'ATM引き出し' }
    const r = resolve(tx({ category: cash }), mapping)
    expect(r.excluded).toContain('除外指定')
    expect(r.categoryName).toBeNull()
  })

  test('未知のカテゴリは推測せず null で返す', () => {
    const unknown = { largeId: '9', largeName: '謎', middleId: '9', middleName: '謎' }
    const r = resolve(tx({ category: unknown }), mapping)
    expect(r.categoryName).toBeNull()
    expect(r.excluded).toBeNull()
  })

  test('未マッピングの口座は excluded になる', () => {
    const r = resolve(tx({ account: '知らない銀行' }), mapping)
    expect(r.excluded).toContain('未マッピング')
  })
})
