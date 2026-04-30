// J-Quants V2 /v2/fins/summary クライアント
// TDnet 由来の決算短信を構造化データとして取得する。
//
// 認証は ダッシュボードで発行した APIキーを `x-api-key` ヘッダーに付与するだけ
// （V1 のリフレッシュトークン → IDトークン交換は廃止された／2025-12-22 以降の登録は V2 必須）。
//
// docs: https://jpx-jquants.com/spec/migration-v1-v2

import { EarningsData, CompanyHistoryEntry } from '@/lib/types/financial';
import { memoryCache } from '@/lib/api/cache';

const JQUANTS_V2_BASE = 'https://api.jquants.com/v2';

// ========== グローバル同時実行リミッタ ==========
//
// J-Quants V2 はプラン依存のレート制限が厳しい。複数の /api/earnings ハンドラが
// 並列に走ると内部の /v2/fins/summary 呼び出しが容易にレート制限を超える。
// プロセス全体で同時実行数を絞るためのシンプルなセマフォ。

const MAX_GLOBAL_CONCURRENT = 2;
let globalInFlight = 0;
const globalQueue: Array<() => void> = [];

async function acquireGlobalSlot(): Promise<void> {
  if (globalInFlight < MAX_GLOBAL_CONCURRENT) {
    globalInFlight++;
    return;
  }
  await new Promise<void>((resolve) => globalQueue.push(resolve));
  globalInFlight++;
}

function releaseGlobalSlot(): void {
  globalInFlight--;
  const next = globalQueue.shift();
  if (next) next();
}

// ========== 生レスポンス型（V2 短縮フィールド） ==========

interface RawStatementV2 {
  DiscDate?: string;        // V1: DisclosedDate
  DiscTime?: string;        // V1: DisclosedTime
  Code?: string;            // V1: LocalCode (5桁)
  DiscNo?: string;          // V1: DisclosureNumber
  DocType?: string;         // V1: TypeOfDocument
  CurPerType?: string;      // V1: TypeOfCurrentPeriod (1Q/2Q/3Q/FY)
  CurPerSt?: string;        // V1: CurrentPeriodStartDate
  CurPerEn?: string;        // V1: CurrentPeriodEndDate
  CurFYSt?: string;         // V1: CurrentFiscalYearStartDate
  CurFYEn?: string;         // V1: CurrentFiscalYearEndDate
  Sales?: string;           // V1: NetSales
  OP?: string;              // V1: OperatingProfit
  OdP?: string;             // V1: OrdinaryProfit
  NP?: string;              // V1: Profit
  FSales?: string;          // V1: ForecastNetSales（通期）
  FOP?: string;             // V1: ForecastOperatingProfit
  FOdP?: string;            // V1: ForecastOrdinaryProfit
  FNP?: string;             // V1: ForecastProfit
  DivAnn?: string;          // V1: ResultDividendPerShareAnnual
  FDivAnn?: string;         // V1: ForecastDividendPerShareAnnual
  [key: string]: unknown;
}

interface StatementsResponseV2 {
  data?: RawStatementV2[];
  pagination_key?: string;
}

// ========== 共通フェッチャ ==========

// 429 (Rate limit) の場合は指数バックオフで最大 5 回リトライ。
// グローバルセマフォと併用してプロセス全体の同時実行数を絞る。
async function fetchWithRateLimitRetry(
  url: string,
  init: RequestInit,
  maxRetries = 5,
): Promise<Response> {
  await acquireGlobalSlot();
  try {
    let attempt = 0;
    for (;;) {
      const res = await fetch(url, init);
      if (res.status !== 429 || attempt >= maxRetries) return res;
      // 1s, 2s, 4s, 8s, 16s（合計最大 31 秒待機）
      const waitMs = 1000 * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, waitMs));
      attempt++;
    }
  } finally {
    releaseGlobalSlot();
  }
}

async function fetchSummaryPaged(
  params: Record<string, string>,
  apiKey: string,
): Promise<RawStatementV2[]> {
  if (!apiKey) {
    throw new Error('J-Quants APIキーが指定されていません');
  }
  const all: RawStatementV2[] = [];
  let paginationKey: string | undefined;

  do {
    const url = new URL(`${JQUANTS_V2_BASE}/fins/summary`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    if (paginationKey) url.searchParams.set('pagination_key', paginationKey);

    const res = await fetchWithRateLimitRetry(url.toString(), {
      headers: { 'x-api-key': apiKey },
    });

    if (!res.ok) {
      const body = await res.text();
      if (res.status === 401) {
        throw new Error(`J-Quants 認証エラー (401): APIキーが無効または未設定です。 ${body}`);
      }
      if (res.status === 403) {
        throw new Error(
          `J-Quants 認証/プランエラー (403): APIキーが無効・期限切れ、もしくは契約プランで /fins/summary が利用できません。 ${body}`,
        );
      }
      if (res.status === 429) {
        throw new Error(`J-Quants レート制限 (429): 一時的に取得量が上限超過しました。少し時間を空けて再実行してください。 ${body}`);
      }
      if (res.status === 400) {
        throw new Error(`J-Quants 400 エラー: ${body}`);
      }
      throw new Error(`J-Quants API エラー (${res.status}): ${body}`);
    }

    const data = (await res.json()) as StatementsResponseV2;
    if (Array.isArray(data.data)) all.push(...data.data);
    paginationKey = data.pagination_key;
  } while (paginationKey);

  return all;
}

/** 日付指定での書類取得。サーバ側で 7 日 (過去日) / 1 時間 (当日) キャッシュ。 */
export async function fetchStatementsByDate(
  date: string,
  apiKey: string,
): Promise<RawStatementV2[]> {
  const cacheKey = `jqStmtByDate:${date}`;
  const cached = memoryCache.get<RawStatementV2[]>(cacheKey);
  if (cached) return cached;

  const stmts = await fetchSummaryPaged({ date }, apiKey);
  const today = new Date().toISOString().split('T')[0];
  const ttl = date < today ? 7 * 24 * 60 * 60 * 1000 : 60 * 60 * 1000;
  memoryCache.set(cacheKey, stmts, ttl);
  return stmts;
}

/** 銘柄コード指定での書類取得（履歴）。30 日キャッシュ。 */
export async function fetchStatementsByCode(
  code4: string,
  apiKey: string,
): Promise<RawStatementV2[]> {
  const cacheKey = `jqStmtByCode:${code4}`;
  const cached = memoryCache.get<RawStatementV2[]>(cacheKey);
  if (cached) return cached;

  // J-Quants の 5 桁コード仕様（4桁 + 普通株 "0"）。両方試す。
  let stmts = await fetchSummaryPaged({ code: code4 }, apiKey);
  if (stmts.length === 0) {
    stmts = await fetchSummaryPaged({ code: `${code4}0` }, apiKey);
  }

  // 開示日昇順にソート
  stmts.sort((a, b) =>
    `${a.DiscDate ?? ''} ${a.DiscTime ?? ''}`.localeCompare(`${b.DiscDate ?? ''} ${b.DiscTime ?? ''}`),
  );

  memoryCache.set(cacheKey, stmts, 30 * 24 * 60 * 60 * 1000);
  return stmts;
}

// ========== マッピング ==========

const TYPE_FY = /^FYFinancialStatements_/i;
const TYPE_QUARTER = /^[1-3]QFinancialStatements_/i;
const TYPE_DIVIDEND_REVISION = /DividendForecastRevision/i;
const TYPE_EARN_REVISION = /EarnForecastRevision/i;

function classifyType(typeOfDocument?: string): EarningsData['type'] {
  if (!typeOfDocument) return 'その他';
  if (TYPE_FY.test(typeOfDocument)) return '決算';
  if (TYPE_QUARTER.test(typeOfDocument)) return '四半期';
  if (TYPE_EARN_REVISION.test(typeOfDocument)) return '業績修正';
  if (TYPE_DIVIDEND_REVISION.test(typeOfDocument)) return '配当修正';
  return 'その他';
}

function localCodeTo4(code?: string): string {
  if (!code) return '';
  return code.length === 5 ? code.substring(0, 4) : code;
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function pct(cur: number | null, prev: number | null): number | null {
  if (cur === null || prev === null || prev === 0) return null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

/** TypeOfDocument のうち、前年同期との比較に使うキー（連結/単独/会計基準が一致するものだけ照合） */
function periodTypeKey(docType?: string): string {
  if (!docType) return '';
  const m = docType.match(/^(FY|1Q|2Q|3Q)FinancialStatements_(Consolidated|NonConsolidated)_(JP|IFRS|US)/);
  if (!m) return docType;
  const cons = m[2] === 'Consolidated' ? 'Cons' : 'NonCons';
  return `${m[1]}_${cons}_${m[3]}`;
}

/** 前年同期 statement を引き当てる。CurPerEn が約 1 年前のもの。 */
function findPriorYearStatement(
  target: RawStatementV2,
  allByCode: RawStatementV2[],
): RawStatementV2 | null {
  const targetKey = periodTypeKey(target.DocType);
  const targetEnd = target.CurPerEn;
  if (!targetEnd) return null;
  const targetEndDt = new Date(targetEnd);
  if (Number.isNaN(targetEndDt.getTime())) return null;

  let best: RawStatementV2 | null = null;
  let bestDiff = Number.POSITIVE_INFINITY;

  for (const s of allByCode) {
    if (s === target) continue;
    if (periodTypeKey(s.DocType) !== targetKey) continue;
    if (!s.CurPerEn) continue;
    const dt = new Date(s.CurPerEn);
    if (Number.isNaN(dt.getTime())) continue;
    const diffDays = (targetEndDt.getTime() - dt.getTime()) / (24 * 60 * 60 * 1000);
    if (diffDays >= 330 && diffDays <= 400 && diffDays < bestDiff) {
      best = s;
      bestDiff = diffDays;
    }
  }
  return best;
}

/** 前四半期 statement を引き当てる。同 FY 内・約 90 日前。 */
function findPriorQuarterStatement(
  target: RawStatementV2,
  allByCode: RawStatementV2[],
): RawStatementV2 | null {
  const targetEnd = target.CurPerEn;
  if (!targetEnd) return null;
  const targetEndDt = new Date(targetEnd);
  if (Number.isNaN(targetEndDt.getTime())) return null;
  const targetFy = target.CurFYEn;

  let best: RawStatementV2 | null = null;
  let bestDiff = Number.POSITIVE_INFINITY;

  for (const s of allByCode) {
    if (s === target) continue;
    if (!s.CurPerEn) continue;
    if (s.CurFYEn !== targetFy) continue;
    const dt = new Date(s.CurPerEn);
    if (Number.isNaN(dt.getTime())) continue;
    const diffDays = (targetEndDt.getTime() - dt.getTime()) / (24 * 60 * 60 * 1000);
    if (diffDays >= 70 && diffDays <= 120 && diffDays < bestDiff) {
      best = s;
      bestDiff = diffDays;
    }
  }
  return best;
}

/**
 * V2 の Sales/OP/OdP/NP は累計値。四半期単独値は 当期累計 - 前四半期累計。
 * 1Q は累計=単独。
 */
function quarterlyValue(
  cumCurrent: number | null,
  prevCumInSameFy: number | null,
  isFirstQuarter: boolean,
): number | null {
  if (cumCurrent === null) return null;
  if (isFirstQuarter) return cumCurrent;
  if (prevCumInSameFy === null) return null;
  return cumCurrent - prevCumInSameFy;
}

interface MapOptions {
  priorYear?: RawStatementV2 | null;
  priorQuarter?: RawStatementV2 | null;
}

export function mapStatementToEarnings(
  s: RawStatementV2,
  opts: MapOptions = {},
): EarningsData {
  const type = classifyType(s.DocType);
  const code = localCodeTo4(s.Code);
  const time = (s.DiscTime || '').substring(0, 5); // HH:MM
  const isFirstQuarter = s.CurPerType === '1Q';

  // 累計値
  const salesCum = toNum(s.Sales);
  const opCum = toNum(s.OP);
  const ordCum = toNum(s.OdP);
  const netCum = toNum(s.NP);

  const prevSalesCum = opts.priorYear ? toNum(opts.priorYear.Sales) : null;
  const prevOpCum = opts.priorYear ? toNum(opts.priorYear.OP) : null;
  const prevOrdCum = opts.priorYear ? toNum(opts.priorYear.OdP) : null;
  const prevNetCum = opts.priorYear ? toNum(opts.priorYear.NP) : null;

  const prevQSalesCum = opts.priorQuarter ? toNum(opts.priorQuarter.Sales) : null;
  const prevQOpCum = opts.priorQuarter ? toNum(opts.priorQuarter.OP) : null;
  const prevQOrdCum = opts.priorQuarter ? toNum(opts.priorQuarter.OdP) : null;
  const prevQNetCum = opts.priorQuarter ? toNum(opts.priorQuarter.NP) : null;

  const salesQ = quarterlyValue(salesCum, prevQSalesCum, isFirstQuarter);
  const opQ = quarterlyValue(opCum, prevQOpCum, isFirstQuarter);
  const ordQ = quarterlyValue(ordCum, prevQOrdCum, isFirstQuarter);
  const netQ = quarterlyValue(netCum, prevQNetCum, isFirstQuarter);

  const divCurrent = toNum(s.DivAnn);
  const divForecast = toNum(s.FDivAnn);
  const prevDiv = opts.priorYear ? toNum(opts.priorYear.DivAnn) : null;
  const dividend = divCurrent ?? divForecast;
  const dividendChange = pct(dividend, prevDiv);

  return {
    date: s.DiscDate || '',
    time,
    code,
    companyName: '', // V2 statements にも会社名は含まれない。UI 側で stockMap から補完
    type,
    salesQQ: pct(salesQ, !isFirstQuarter && prevQSalesCum !== null ? prevQSalesCum : null),
    operatingProfitQQ: pct(opQ, !isFirstQuarter && prevQOpCum !== null ? prevQOpCum : null),
    ordinaryProfitQQ: pct(ordQ, !isFirstQuarter && prevQOrdCum !== null ? prevQOrdCum : null),
    netProfitQQ: pct(netQ, !isFirstQuarter && prevQNetCum !== null ? prevQNetCum : null),
    salesYY: pct(salesCum, prevSalesCum),
    operatingProfitYY: pct(opCum, prevOpCum),
    ordinaryProfitYY: pct(ordCum, prevOrdCum),
    netProfitYY: pct(netCum, prevNetCum),
    salesCon: null,
    operatingProfitCon: null,
    ordinaryProfitCon: null,
    netProfitCon: null,
    dividend,
    dividendChange,
    disclosureNumber: s.DiscNo,
    disclosureType: s.DocType,
    periodEnd: s.CurPerEn,
    fiscalYearEnd: s.CurFYEn,
  };
}

// ========== 日付指定: 一覧取得（YoY つき） ==========

export async function fetchEarningsFromJQuants(
  date: string,
  apiKey: string,
  options?: { maxConcurrent?: number; batchDelayMs?: number },
): Promise<EarningsData[]> {
  // J-Quants V2 にはレート制限があるので、並列度を絞る + バッチ間に小休止
  const maxConcurrent = options?.maxConcurrent ?? 3;
  const batchDelayMs = options?.batchDelayMs ?? 200;

  const todayStmts = await fetchStatementsByDate(date, apiKey);
  if (todayStmts.length === 0) return [];

  // 履歴フェッチが必要なのは YoY/QoQ を計算する 決算 と 四半期 のみ。
  // 業績修正・配当修正・その他は単発レコードなので履歴不要。
  const codesNeedingHistory = Array.from(
    new Set(
      todayStmts
        .filter((s) => {
          const t = classifyType(s.DocType);
          return t === '決算' || t === '四半期';
        })
        .map((s) => localCodeTo4(s.Code))
        .filter(Boolean),
    ),
  );

  // 並列で各銘柄の履歴を取得（キャッシュ済みは即返る）
  const historyByCode = new Map<string, RawStatementV2[]>();
  for (let i = 0; i < codesNeedingHistory.length; i += maxConcurrent) {
    const batch = codesNeedingHistory.slice(i, i + maxConcurrent);
    await Promise.all(
      batch.map(async (code) => {
        try {
          const list = await fetchStatementsByCode(code, apiKey);
          historyByCode.set(code, list);
        } catch (e) {
          console.warn(`[jq] history fetch failed for ${code}:`, e instanceof Error ? e.message : e);
          historyByCode.set(code, []);
        }
      }),
    );
    if (i + maxConcurrent < codesNeedingHistory.length && batchDelayMs > 0) {
      await new Promise((r) => setTimeout(r, batchDelayMs));
    }
  }

  const results: EarningsData[] = todayStmts.map((s) => {
    const code = localCodeTo4(s.Code);
    const history = historyByCode.get(code) || [];
    const priorYear = history.length > 0 ? findPriorYearStatement(s, history) : null;
    const priorQuarter = history.length > 0 ? findPriorQuarterStatement(s, history) : null;
    return mapStatementToEarnings(s, { priorYear, priorQuarter });
  });

  results.sort((a, b) => a.time.localeCompare(b.time));
  return results;
}

// ========== 銘柄の決算履歴（過去 N 四半期推移） ==========

export async function fetchCompanyHistoryFromJQuants(
  code: string,
  apiKey: string,
  options?: { limit?: number },
): Promise<{ history: CompanyHistoryEntry[]; scannedDates: number; matchedDocs: number }> {
  const limit = options?.limit ?? 8;
  const allRaw = await fetchStatementsByCode(code, apiKey);

  const stmts = allRaw.filter((s) => {
    const t = classifyType(s.DocType);
    return t === '決算' || t === '四半期';
  });

  // periodEnd × periodTypeKey で重複解決（修正版は新しい開示日を優先）
  const byKey = new Map<string, RawStatementV2>();
  for (const s of stmts) {
    const key = `${s.CurPerEn || s.DiscDate}::${periodTypeKey(s.DocType)}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, s);
      continue;
    }
    const newer =
      `${s.DiscDate ?? ''} ${s.DiscTime ?? ''}` >
      `${existing.DiscDate ?? ''} ${existing.DiscTime ?? ''}`;
    if (newer) byKey.set(key, s);
  }

  const ordered = Array.from(byKey.values()).sort((a, b) =>
    (a.CurPerEn || '').localeCompare(b.CurPerEn || ''),
  );

  const recent = ordered.slice(-limit);

  const entries: CompanyHistoryEntry[] = recent.map((s) => {
    const priorYear = findPriorYearStatement(s, ordered);
    const priorQuarter = findPriorQuarterStatement(s, ordered);

    const salesCum = toNum(s.Sales);
    const opCum = toNum(s.OP);
    const netCum = toNum(s.NP);

    const prevSalesCum = priorYear ? toNum(priorYear.Sales) : null;
    const prevOpCum = priorYear ? toNum(priorYear.OP) : null;
    const prevNetCum = priorYear ? toNum(priorYear.NP) : null;

    const isFirstQuarter = s.CurPerType === '1Q';
    const prevQSalesCum = priorQuarter ? toNum(priorQuarter.Sales) : null;
    const prevQOpCum = priorQuarter ? toNum(priorQuarter.OP) : null;
    const prevQNetCum = priorQuarter ? toNum(priorQuarter.NP) : null;

    const salesQ = quarterlyValue(salesCum, prevQSalesCum, isFirstQuarter);
    const opQ = quarterlyValue(opCum, prevQOpCum, isFirstQuarter);
    const netQ = quarterlyValue(netCum, prevQNetCum, isFirstQuarter);

    return {
      periodEnd: s.CurPerEn || '',
      filingDate: s.DiscDate || '',
      type: classifyType(s.DocType),
      disclosureNumber: s.DiscNo || '',
      disclosureType: s.DocType || '',
      salesCum,
      opProfitCum: opCum,
      netProfitCum: netCum,
      salesYY: pct(salesCum, prevSalesCum),
      opYY: pct(opCum, prevOpCum),
      netYY: pct(netCum, prevNetCum),
      salesQQ: pct(salesQ, !isFirstQuarter && prevQSalesCum !== null ? prevQSalesCum : null),
      opQQ: pct(opQ, !isFirstQuarter && prevQOpCum !== null ? prevQOpCum : null),
      netQQ: pct(netQ, !isFirstQuarter && prevQNetCum !== null ? prevQNetCum : null),
      salesForecast: toNum(s.FSales),
      opProfitForecast: toNum(s.FOP),
      netProfitForecast: toNum(s.FNP),
    };
  });

  return {
    history: entries,
    scannedDates: ordered.length,
    matchedDocs: stmts.length,
  };
}
