export type MfCategory = {
  largeId: string;
  largeName: string;
  middleId: string;
  middleName: string;
};

export type MfTransaction = {
  id: string;
  date: string;
  amount: number;
  account: string;
  category: MfCategory | null;
  memo: string | null;
  title: string;
  isTransfer: boolean;
  isManualEntry: boolean;
};

/** payee 条件付きの上書きルール。先に書いたものが優先される。 */
export type OverrideRule = {
  /** MF の大項目。省略時は全て */
  large?: string;
  /** MF の中項目。省略時は全て */
  middle?: string;
  /** title (payee) の部分一致。省略時は全て */
  titleContains?: string;
  /** 振り先。Actual のカテゴリ名。"-" は除外 */
  to: string;
};

export type Mapping = {
  /** MF の account 名 -> Actual の account 名 */
  accounts: Record<string, string>;
  /** "大項目/中項目" -> Actual のカテゴリ名。"-" は除外 */
  categories: Record<string, string>;
  /** categories より優先して評価される上書き */
  overrides: OverrideRule[];
};

export type Resolved = {
  tx: MfTransaction;
  accountName: string | null;
  categoryName: string | null;
  /** 除外理由。null なら投入対象 */
  excluded: string | null;
};
