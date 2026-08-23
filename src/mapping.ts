import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { normalizeTitle } from "./normalize.ts";
import type { Mapping, MfTransaction, Resolved } from "./types.ts";

export const EXCLUDE = "-";

export function mappingPath(): string {
  const base = process.env["XDG_CONFIG_HOME"] ?? join(homedir(), ".config");
  return join(base, "mf2actual", "mapping.json");
}

export function loadMapping(path = mappingPath()): Mapping {
  if (!existsSync(path)) {
    throw new Error(`マッピングがありません: ${path}\n先に \`mf2actual init\` を実行してください`);
  }
  const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<Mapping>;
  return {
    accounts: raw.accounts ?? {},
    categories: raw.categories ?? {},
    overrides: raw.overrides ?? [],
  };
}

export function saveMapping(m: Mapping, path = mappingPath()): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(m, null, 2)}\n`);
}

export function categoryKey(tx: MfTransaction): string {
  if (!tx.category) return "(未分類)";
  return `${tx.category.largeName}/${tx.category.middleName}`;
}

/**
 * 1 取引の振り先を決める。
 *
 * overrides を先に評価し、次に categories を見る。
 * どちらにも無いものは categoryName = null で返し、呼び出し側が洗い出す。
 * 推測で割り当てない (誤った分類は次回以降の集計をずっと歪めるため)。
 */
export function resolve(tx: MfTransaction, m: Mapping): Resolved {
  const accountName = m.accounts[tx.account] ?? null;
  if (accountName === EXCLUDE) {
    return { tx, accountName: null, categoryName: null, excluded: `口座 ${tx.account} が除外指定` };
  }

  const key = categoryKey(tx);
  let categoryName: string | null = null;

  for (const rule of m.overrides) {
    if (rule.large && rule.large !== tx.category?.largeName) continue;
    if (rule.middle && rule.middle !== tx.category?.middleName) continue;
    if (rule.titleContains && !normalizeTitle(tx.title).includes(normalizeTitle(rule.titleContains))) {
      continue;
    }
    categoryName = rule.to;
    break;
  }
  if (categoryName === null) {
    categoryName = m.categories[key] ?? null;
  }

  if (categoryName === EXCLUDE) {
    return { tx, accountName, categoryName: null, excluded: `カテゴリ ${key} が除外指定` };
  }
  if (accountName === null) {
    return { tx, accountName: null, categoryName, excluded: `口座 ${tx.account} が未マッピング` };
  }
  return { tx, accountName, categoryName, excluded: null };
}
