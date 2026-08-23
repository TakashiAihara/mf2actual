import * as api from "@actual-app/api";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type ActualConfig = {
  serverURL: string;
  password: string;
  syncId: string;
  dataDir?: string;
};

/**
 * 環境変数から接続情報を読む。
 *
 * password は Infisical から `inf-run` 経由で注入する前提で、
 * 設定ファイルにもコードにも書かない。
 */
export function configFromEnv(): ActualConfig {
  const serverURL = process.env["ACTUAL_SERVER_URL"];
  const password = process.env["ACTUAL_PASSWORD"];
  const syncId = process.env["ACTUAL_SYNC_ID"];
  const missing = [
    ["ACTUAL_SERVER_URL", serverURL],
    ["ACTUAL_PASSWORD", password],
    ["ACTUAL_SYNC_ID", syncId],
  ]
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length > 0) {
    throw new Error(
      `環境変数が足りません: ${missing.join(", ")}\n` +
        "inf-run 経由で Infisical から注入してください",
    );
  }
  return {
    serverURL: serverURL as string,
    password: password as string,
    syncId: syncId as string,
    dataDir: process.env["ACTUAL_DATA_DIR"],
  };
}

export async function connect(cfg: ActualConfig): Promise<void> {
  const dataDir = cfg.dataDir ?? mkdtempSync(join(tmpdir(), "mf2actual-"));
  await api.init({ dataDir, serverURL: cfg.serverURL, password: cfg.password });
  await api.downloadBudget(cfg.syncId);
}

export async function disconnect(): Promise<void> {
  await api.shutdown();
}

/** name -> id の対応を取る。無いものは作る。 */
export async function ensureAccounts(names: string[]): Promise<Map<string, string>> {
  const existing = await api.getAccounts();
  const byName = new Map(existing.map((a) => [a.name, a.id as string]));
  for (const name of names) {
    if (byName.has(name)) continue;
    const id = await api.createAccount({ name, offbudget: false }, 0);
    byName.set(name, id);
  }
  return byName;
}

/**
 * カテゴリを用意する。キーは `グループ/カテゴリ` 形式で、スラッシュが無ければ
 * defaultGroup の下に置く。Actual のカテゴリは group > category の 2 階層なので、
 * マッピング側で `食費/日常食` と書けばそのまま階層になる。
 *
 * 戻り値のキーは渡した `グループ/カテゴリ` のまま。Actual 側のカテゴリ名は
 * スラッシュ以降だけなので、別グループに同名カテゴリがあっても取り違えない。
 */
export async function ensureCategories(
  keys: string[],
  defaultGroup: string,
): Promise<Map<string, string>> {
  const groups = await api.getCategoryGroups();
  const groupIds = new Map(groups.map((g) => [g.name, g.id as string]));
  const existing = await api.getCategories();

  const out = new Map<string, string>();
  for (const key of keys) {
    const idx = key.indexOf("/");
    const groupName = idx === -1 ? defaultGroup : key.slice(0, idx);
    const catName = idx === -1 ? key : key.slice(idx + 1);

    let groupId = groupIds.get(groupName);
    if (!groupId) {
      groupId = await api.createCategoryGroup({ name: groupName, is_income: false });
      groupIds.set(groupName, groupId);
    }

    const hit = existing.find((c) => c.name === catName && c.group_id === groupId);
    if (hit) {
      out.set(key, hit.id as string);
      continue;
    }
    const id = await api.createCategory({ name: catName, group_id: groupId });
    out.set(key, id);
    existing.push({ id, name: catName, group_id: groupId } as never);
  }
  return out;
}

export type ImportRow = {
  date: string;
  amount: number;
  payee_name: string;
  notes?: string;
  category?: string;
  imported_id: string;
};

/**
 * importTransactions を使う。addTransactions ではない。
 * importTransactions は imported_id で重複を排除するので、同じ期間を
 * 何度流しても増えない。addTransactions にはその排除が無い。
 */
export async function importInto(
  accountId: string,
  rows: ImportRow[],
): Promise<{ added: number; updated: number }> {
  const res = await api.importTransactions(accountId, rows as never);
  return {
    added: (res.added as unknown[] | undefined)?.length ?? 0,
    updated: (res.updated as unknown[] | undefined)?.length ?? 0,
  };
}

export { api };
