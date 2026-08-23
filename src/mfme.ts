import { spawnSync } from "node:child_process";

import type { MfTransaction } from "./types.ts";

/**
 * mfme-cli を子プロセスとして呼ぶ。
 *
 * ライブラリとして import しないのは、mfme-cli が MF ME 専用 CLI であり
 * Actual 連携はそのスコープ外だから。依存を「PATH に mfme があること」だけに保つ。
 */
export function fetchTransactions(since: string, until: string, bin = "mfme"): MfTransaction[] {
  const res = spawnSync(bin, ["list", "--since", since, "--until", until, "--format", "json"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });

  if (res.error) {
    throw new Error(`${bin} の起動に失敗しました: ${res.error.message}`);
  }
  if (res.status !== 0) {
    throw new Error(`${bin} list が exit ${res.status} で終了しました\n${res.stderr}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(res.stdout);
  } catch (e) {
    throw new Error(`${bin} list の出力が JSON として読めません: ${(e as Error).message}`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`${bin} list が配列を返しませんでした`);
  }

  return parsed as MfTransaction[];
}
