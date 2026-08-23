# mf2actual

マネーフォワード ME の取引を [Actual Budget](https://actualbudget.org/) に流し込む CLI。

日本の金融機関は個人向けの共通 API を開いていないので、Actual の銀行連携（GoCardless / SimpleFIN）は使えない。MF ME を収集役にして、そこから Actual に持ってくる。

```text
MF ME (自動連携) --> mfme-cli --> mf2actual --> Actual Budget
```

## 前提

- [mfme-cli](https://github.com/TakashiAihara/mfme-cli) が PATH にあること。**ライブラリとしては使わず、`mfme list` を子プロセスで呼ぶだけ**なので、mfme-cli 側に手を入れる必要はない
- Actual サーバが動いていること（self-host / クラウドどちらでも）
- **Node 22.6 以上**（Bun ではない。理由は下記）

### Bun ではなく Node で動かす

`@actual-app/api` は `better-sqlite3` に依存していて、Bun はそのネイティブアドオンを読めない（`'better-sqlite3' is not yet supported in Bun`）。そのため実行は Node で行う。

型注釈しか使っていないので、Node 22 の type stripping（`--experimental-strip-types`）で足りる。ビルド手順は無い。テストだけは `bun test` を使っている（テスト対象が `better-sqlite3` に触らないため）。

## セットアップ

```bash
bun install
bun run install-bin   # ~/.local/bin/mf2actual に symlink
```

接続情報は環境変数で渡す。パスワードを設定ファイルに置かないための構成。

| 変数 | 内容 |
|---|---|
| `ACTUAL_SERVER_URL` | `https://actual.example.com` |
| `ACTUAL_PASSWORD` | サーバのパスワード |
| `ACTUAL_SYNC_ID` | 予算ファイルの Sync ID（Actual の Settings → Advanced で見られる） |
| `ACTUAL_DATA_DIR` | 予算のローカルキャッシュ置き場（省略時は一時ディレクトリ） |

## 使い方

```bash
# 1. マッピングの雛形を作る
mf2actual init

# 2. MF に出てくる口座とカテゴリを見る
mf2actual map --since 2026-07-01 --until 2026-07-31

# 3. マッピングを書く (~/.config/mf2actual/mapping.json)

# 4. 何が入るか確認する
mf2actual sync --since 2026-07-01 --until 2026-07-31 --dry-run

# 5. 投入する
mf2actual sync --since 2026-07-01 --until 2026-07-31
```

## 同じ期間を何度流しても増えない

MF の取引 ID を Actual の `imported_id` に入れ、`importTransactions` に渡している。Actual 側が `imported_id` で重複を弾くので、期間の区切りを気にせず再実行できる。

`addTransactions` は重複排除を行わないので使っていない。

## mapping.json

```json
{
  "accounts": {
    "<MF の口座名>": "<Actual の口座名>",
    "": "-"
  },
  "categories": {
    "食費/食料品": "食費/日常食",
    "現金・カード/ATM引き出し": "-"
  },
  "overrides": [
    { "titleContains": "Amazon Market", "to": "食費/Amazon" },
    { "large": "日用品", "titleContains": "スーパーＢ", "to": "食費/日常食" }
  ]
}
```

- `accounts` は MF の口座名 → Actual の口座名
- `categories` は MF の `大項目/中項目` → Actual の `グループ/カテゴリ`。Actual のカテゴリは 2 階層なので、スラッシュがそのまま階層になる
- `overrides` は `categories` より先に評価される。上から順に見て最初に一致したものを使う
- 値が `-` のものは投入しない。除外した件数と合計額は実行時に表示される
- マッピングに無いものは**推測で割り当てず**、未マッピングとして報告する。誤った分類は以後の集計をずっと歪めるため

### 加盟店名の正規化

`titleContains` の比較は両側を正規化してから行う。MF の加盟店名は表記が揺れていて、そのまま比較すると黙って一致しない。

- NFKC で全角英数と全角スペース（U+3000）を半角に寄せる
- `Mastercardデビット A0123456 ` のような決済 prefix を落とす
- 連続空白を 1 個に潰す

そのため、マッピングには `Amazon Market` と半角で書けば `Ａｍａｚｏｎ　Ｍａｒｋｅｔ　Ｐｌａｃｅ` にも一致する。

末尾の参照コードは落とさない。`PAYPAL *GOOGLE YOUTUB` / `INOREA` / `GOOGLE` のように英字だけの末尾トークンを削ると、別サービスが 1 つに潰れるため。

## 資金移動

カード引き落とし・電子マネーチャージ・ATM 出金をそのまま入れると、カード明細側と二重計上になる。`init` が吐く雛形はこれらを `-`（除外）にしてある。

Actual の口座間 transfer としては扱っていない。除外した合計額は毎回表示するので、金額が想定と違えばそこで気づける。

## 開発

```bash
bun test          # 単体テスト
bun run typecheck
bun run lint
```

## ライセンス

なし（個人利用向け）
