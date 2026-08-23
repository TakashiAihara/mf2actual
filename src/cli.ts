#!/usr/bin/env -S node --experimental-strip-types
// Bun ではなく Node で動かす。@actual-app/api が better-sqlite3 に依存しており、
// Bun は better-sqlite3 のネイティブアドオンを読めない
// ('better-sqlite3' is not yet supported in Bun)。
// 型注釈しか使っていないので Node 22 の type stripping で足りる。
import * as apiUtils from "@actual-app/api";
import { Command } from "commander";

import {
  connect,
  configFromEnv,
  disconnect,
  ensureAccounts,
  ensureCategories,
  importInto,
} from "./actual.ts";
import type { ImportRow } from "./actual.ts";
import { categoryKey, EXCLUDE, loadMapping, mappingPath, saveMapping, resolve } from "./mapping.ts";
import { fetchTransactions } from "./mfme.ts";
import { normalizeTitle } from "./normalize.ts";
import type { Mapping, Resolved } from "./types.ts";

const program = new Command();
program.name("mf2actual").description("Moneyforward ME の取引を Actual Budget に同期する");

function yen(n: number): string {
  return n.toLocaleString("ja-JP");
}

function summarize(resolved: Resolved[]): void {
  const excluded = resolved.filter((r) => r.excluded);
  const unmapped = resolved.filter((r) => !r.excluded && r.categoryName === null);
  const target = resolved.filter((r) => !r.excluded && r.categoryName !== null);

  console.log(
    `対象 ${target.length} 件 / 除外 ${excluded.length} 件 / 未マッピング ${unmapped.length} 件`,
  );

  if (excluded.length > 0) {
    const sum = excluded.reduce((a, r) => a + Math.abs(r.tx.amount), 0);
    console.log(`\n除外した合計 ${yen(sum)} 円 (黙って落とさないために出しています)`);
    const byReason = new Map<string, number>();
    for (const r of excluded) {
      byReason.set(r.excluded as string, (byReason.get(r.excluded as string) ?? 0) + 1);
    }
    for (const [reason, n] of [...byReason].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${n} 件  ${reason}`);
    }
  }

  if (unmapped.length > 0) {
    console.log("\n未マッピング (推測で割り当てていません)");
    const byKey = new Map<string, number>();
    for (const r of unmapped) {
      const k = categoryKey(r.tx);
      byKey.set(k, (byKey.get(k) ?? 0) + 1);
    }
    for (const [k, n] of [...byKey].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${n} 件  ${k}`);
    }
  }
}

program
  .command("map")
  .description("MF 側に出てくる口座とカテゴリを一覧し、マッピング漏れを洗い出す")
  .requiredOption("--since <date>", "開始日 YYYY-MM-DD")
  .requiredOption("--until <date>", "終了日 YYYY-MM-DD")
  .action((opts: { since: string; until: string }) => {
    const txs = fetchTransactions(opts.since, opts.until);
    const accounts = new Map<string, number>();
    const cats = new Map<string, number>();
    for (const tx of txs) {
      accounts.set(tx.account, (accounts.get(tx.account) ?? 0) + 1);
      const k = categoryKey(tx);
      cats.set(k, (cats.get(k) ?? 0) + 1);
    }
    console.log(`取引 ${txs.length} 件 (${opts.since} 〜 ${opts.until})\n`);
    console.log("口座");
    for (const [k, n] of [...accounts].sort((a, b) => b[1] - a[1])) console.log(`  ${n} 件  ${k}`);
    console.log("\nカテゴリ");
    for (const [k, n] of [...cats].sort((a, b) => b[1] - a[1])) console.log(`  ${n} 件  ${k}`);
  });

program
  .command("init")
  .description("マッピングの雛形を書き出す")
  .option("--force", "既存を上書きする", false)
  .action((opts: { force: boolean }) => {
    const path = mappingPath();
    const template: Mapping = {
      accounts: {},
      categories: {
        "現金・カード/カード引き落とし": EXCLUDE,
        "現金・カード/ATM引き出し": EXCLUDE,
        "現金・カード/電子マネー": EXCLUDE,
        "(未分類)": EXCLUDE,
      },
      overrides: [],
    };
    if (!opts.force) {
      try {
        loadMapping(path);
        console.error(`すでにあります: ${path}\n上書きするなら --force`);
        process.exit(1);
      } catch {
        // 無いので続行
      }
    }
    saveMapping(template, path);
    console.log(`書き出しました: ${path}`);
    console.log("`mf2actual map` で実際に出てくる口座とカテゴリを見て埋めてください");
  });

program
  .command("sync")
  .description("取引を Actual に投入する")
  .requiredOption("--since <date>", "開始日 YYYY-MM-DD")
  .requiredOption("--until <date>", "終了日 YYYY-MM-DD")
  .option("--dry-run", "Actual には書かず、何をするかだけ出す", false)
  .option("--group <name>", "カテゴリを作るグループ名", "MF")
  .action(async (opts: { since: string; until: string; dryRun: boolean; group: string }) => {
    const mapping = loadMapping();
    const txs = fetchTransactions(opts.since, opts.until);
    const resolved = txs.map((tx) => resolve(tx, mapping));
    summarize(resolved);

    const target = resolved.filter((r) => !r.excluded && r.categoryName !== null);
    if (opts.dryRun) {
      const byCat = new Map<string, { n: number; sum: number }>();
      for (const r of target) {
        const k = r.categoryName as string;
        const cur = byCat.get(k) ?? { n: 0, sum: 0 };
        cur.n += 1;
        cur.sum += -r.tx.amount;
        byCat.set(k, cur);
      }
      console.log("\n投入内容 (カテゴリ別、支出を正で表示)");
      for (const [k, v] of [...byCat].sort((a, b) => b[1].sum - a[1].sum)) {
        console.log(`  ${yen(v.sum).padStart(12)}  ${String(v.n).padStart(4)} 件  ${k}`);
      }
      console.log("\n--dry-run なので Actual には書きません");
      return;
    }
    if (target.length === 0) {
      console.log("\n投入対象がありません");
      return;
    }

    const cfg = configFromEnv();
    await connect(cfg);
    try {
      const accountIds = await ensureAccounts([
        ...new Set(target.map((r) => r.accountName as string)),
      ]);
      const categoryIds = await ensureCategories(
        [...new Set(target.map((r) => r.categoryName as string))],
        opts.group,
      );

      const byAccount = new Map<string, ImportRow[]>();
      for (const r of target) {
        const accId = accountIds.get(r.accountName as string) as string;
        const rows = byAccount.get(accId) ?? [];
        rows.push({
          date: r.tx.date,
          amount: apiUtils.utils.amountToInteger(r.tx.amount),
          payee_name: normalizeTitle(r.tx.title),
          notes: r.tx.memo ?? undefined,
          category: categoryIds.get(r.categoryName as string),
          imported_id: r.tx.id,
        });
        byAccount.set(accId, rows);
      }

      let added = 0;
      let updated = 0;
      for (const [accId, rows] of byAccount) {
        const res = await importInto(accId, rows);
        added += res.added;
        updated += res.updated;
      }
      console.log(`\n追加 ${added} 件 / 更新 ${updated} 件`);
      console.log("(imported_id で重複排除しているので、同じ期間を再実行しても増えません)");
    } finally {
      await disconnect();
    }
  });

await program.parseAsync(process.argv);
