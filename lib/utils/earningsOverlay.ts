// メイン画面（株価スクリーニング）に決算成長率（QQ/YY）を重ねるためのクライアントユーティリティ。
//
// 設計意図:
// メイン画面が扱う `Stock` 型は株価指標（PER/PBR/ROE/配当等）のみで決算成長率を持たない。
// 一方、決算の QQ/YY は `/api/earnings?date=` が「開示日ごと」に返す。
// そこで指定期間の各営業日の決算を取得し、銘柄コード単位で **最新開示** の成長率に畳み込んで
// `Map<code, EarningsGrowth>` を作る。メイン画面はこれを株価行に join して
// 「割安 × 増益」のような複合スクリーニングを可能にする。
//
// 注意（CLAUDE.md: お金が絡む数値の正確性）:
// - 同一銘柄が期間内に複数回開示している場合は「開示日が最も新しいもの」を採用（古い決算を新鮮に見せない）。
// - QQ/YY を持たない書類（業績修正・配当修正）は対象外。決算・四半期のみ畳み込む。
// - 期間外（最近決算を出していない）銘柄は Map に存在せず、UI 側は「—」表示にする。

import { EarningsData } from '@/lib/types/financial';

export interface EarningsGrowth {
  code: string;
  disclosedDate: string; // 採用した開示日（YYYY-MM-DD）。鮮度表示に使う
  type: string;          // '決算' | '四半期'
  salesQQ: number | null;
  operatingProfitQQ: number | null;
  ordinaryProfitQQ: number | null;
  netProfitQQ: number | null;
  salesYY: number | null;
  operatingProfitYY: number | null;
  ordinaryProfitYY: number | null;
  netProfitYY: number | null;
}

/** YYYY-MM-DD を days 日ずらす（タイムゾーン非依存） */
function shiftYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

/** from..to（両端含む）の営業日（土日除外）を新しい順に列挙 */
function businessDaysDesc(fromDate: string, toDate: string): string[] {
  const out: string[] = [];
  let d = toDate;
  let guard = 0;
  while (d >= fromDate && guard < 400) {
    const [y, m, day] = d.split('-').map(Number);
    const dow = new Date(Date.UTC(y, m - 1, day)).getUTCDay();
    if (dow !== 0 && dow !== 6) out.push(d); // 0=日, 6=土 を除外
    d = shiftYmd(d, -1);
    guard++;
  }
  return out;
}

function authHeaders(): HeadersInit {
  const headers: HeadersInit = {};
  if (typeof window === 'undefined') return headers;
  const apiKey = localStorage.getItem('jquants_api_key') || '';
  if (apiKey) headers['x-jquants-api-key'] = apiKey;
  return headers;
}

interface EarningsApiResponse {
  earnings?: EarningsData[];
}

/**
 * 指定期間の決算成長率を銘柄コード単位に畳み込んで返す。
 * 期間内の各営業日について `/api/earnings?date=&source=tdnet` を直列に叩く
 * （サーバ側は過去日 7d キャッシュなので再オープンはほぼ無料）。
 *
 * @param onProgress 進捗コールバック (done, total)
 * @param signal     中断用。ページ離脱や再フェッチ時に渡す
 */
export async function fetchEarningsOverlay(
  fromDate: string,
  toDate: string,
  opts?: { onProgress?: (done: number, total: number) => void; signal?: AbortSignal },
): Promise<Map<string, EarningsGrowth>> {
  const dates = businessDaysDesc(fromDate, toDate);
  const map = new Map<string, EarningsGrowth>();
  const headers = authHeaders();

  for (let i = 0; i < dates.length; i++) {
    if (opts?.signal?.aborted) break;
    const date = dates[i];
    try {
      const res = await fetch(`/api/earnings?date=${date}&source=tdnet`, {
        headers,
        signal: opts?.signal,
      });
      if (res.ok) {
        const json = (await res.json()) as EarningsApiResponse;
        for (const e of json.earnings ?? []) {
          if (e.type !== '決算' && e.type !== '四半期') continue;
          if (!e.code) continue;
          const existing = map.get(e.code);
          // より新しい開示日のものだけ採用（古い決算で上書きしない）
          if (existing && existing.disclosedDate >= e.date) continue;
          map.set(e.code, {
            code: e.code,
            disclosedDate: e.date,
            type: e.type,
            salesQQ: e.salesQQ,
            operatingProfitQQ: e.operatingProfitQQ,
            ordinaryProfitQQ: e.ordinaryProfitQQ,
            netProfitQQ: e.netProfitQQ,
            salesYY: e.salesYY,
            operatingProfitYY: e.operatingProfitYY,
            ordinaryProfitYY: e.ordinaryProfitYY,
            netProfitYY: e.netProfitYY,
          });
        }
      }
    } catch {
      // 個別日の失敗（中断・週末空・レート制限）は握らず次の日へ。
      // 部分的にでも overlay を返す方が「全く出ない」より投資判断に資する。
    }
    opts?.onProgress?.(i + 1, dates.length);
  }

  return map;
}

/** EarningsGrowth から指標キーで値を取り出す（ソート・フィルタ用） */
export type GrowthMetricKey =
  | 'operatingProfitQQ' | 'netProfitQQ' | 'ordinaryProfitQQ' | 'salesQQ'
  | 'operatingProfitYY' | 'netProfitYY' | 'ordinaryProfitYY' | 'salesYY';

export function growthValue(g: EarningsGrowth | undefined, key: GrowthMetricKey): number | null {
  if (!g) return null;
  const v = g[key];
  return v ?? null;
}
