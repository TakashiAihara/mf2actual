/**
 * MF の加盟店名を正規化する。
 *
 * MF が返す title は表記が揺れる。同じ Amazon でも `AMAZON DOWNLOADS`（半角）と
 * `Amazon<U+3000>Market<U+3000>Place` (全角英数 + 全角スペース U+3000) が混在する。
 * 正規化せずに部分一致すると、マッピングが黙って効かない。
 *
 * 実際に踏んだ: マッピングに半角スペースで `Ａｍａｚｏｎ Ｍａｒｋｅｔ` と書いたが
 * 生の title は全角スペースだったため一致せず、Amazon 53 万円が食費に混ざったまま
 * 集計された。エラーにならず件数も減らないので、既存の集計と突き合わせるまで
 * 気づけなかった。
 *
 * 手順は 3 段階。
 *   1. NFKC で全角英数と全角スペースを半角に寄せる
 *   2. `Mastercardデビット A0123456 ` のような決済 prefix を落とす
 *   3. 空白を 1 個に潰して trim する
 *
 * 末尾の参照コードは落とさない。`PAYPAL *GOOGLE YOUTUB` / `INOREA` / `GOOGLE` の
 * ように、英字だけの末尾トークンを削ると別サービスが 1 つに潰れるため。
 */
export function normalizeTitle(raw: string): string {
  return raw
    .normalize('NFKC')
    .replace(/^Mastercardデビット\s*\S+\s*/, '')
    .replace(/\s+/g, ' ')
    .trim()
}
