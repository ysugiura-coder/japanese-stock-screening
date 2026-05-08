/**
 * J-Quants は銘柄コードを 5 桁文字列で返す（例: 普通株 8697 → "86970"、新形式 285A → "285A0"）。
 * UI・お気に入り・URL ルート・/v2/fins/summary 起源の決算データはすべて 4 桁を前提にしている。
 * stockMap のキーが 5 桁・決算行が 4 桁だと照合に失敗して「社名未取得」になるため、
 * /listed/info や /equities/master 経由の銘柄ユニバースは必ずこの関数で 4 桁に正規化する。
 *
 * 5 桁でなければ素通し（4 桁・古い形式・不明形式はそのまま）。
 */
export function normalizeStockCode(code: string | undefined | null): string {
  if (!code) return '';
  const s = String(code);
  return s.length === 5 ? s.substring(0, 4) : s;
}
