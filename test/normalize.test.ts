import { describe, expect, test } from 'bun:test'

import { normalizeTitle } from '../src/normalize.ts'

describe('normalizeTitle', () => {
  test('全角スペース U+3000 を半角に寄せる', () => {
    // 実際に踏んだケース。MF が返す Amazon の title は全角スペース区切りで、
    // マッピングを半角スペースで書くと一致せず、黙って分類が漏れる。
    const raw = 'Ａｍａｚｏｎ　Ｍａｒｋｅｔ　Ｐｌａｃｅ'
    expect(normalizeTitle(raw)).toBe('Amazon Market Place')
  })

  test('全角英数を半角に寄せる', () => {
    expect(normalizeTitle('ＡＭＡＺＯＮ．ＣＯ．ＪＰ')).toBe('AMAZON.CO.JP')
  })

  test('Mastercard デビットの prefix を落とす', () => {
    expect(normalizeTitle('Mastercardデビット A0000000 マネーフォワードクラウド')).toBe(
      'マネーフォワードクラウド',
    )
  })

  test('連続空白を 1 個に潰して trim する', () => {
    expect(normalizeTitle('  スーパー   Ａ店  ')).toBe('スーパー A店')
  })

  test('英字のみの末尾トークンは削らない', () => {
    // PAYPAL *GOOGLE YOUTUB / INOREA / GOOGLE が 1 つに潰れると別サービスが合算される
    expect(normalizeTitle('ＰＡＹＰＡＬ ＊ＧＯＯＧＬＥ ＹＯＵＴＵＢ')).toBe(
      'PAYPAL *GOOGLE YOUTUB',
    )
  })

  test('日本語はそのまま残る', () => {
    expect(normalizeTitle('コンビニ－ストア１号店')).toBe('コンビニ-ストア1号店')
  })
})
