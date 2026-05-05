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

// ========== グローバル同時実行リミッタ + 最小インターバル ==========
//
// J-Quants V2 はプラン依存のレート制限が厳しい。複数の /api/earnings ハンドラが
// 並列に走ると内部の /v2/fins/summary 呼び出しが容易にレート制限を超える。
// プロセス全体で同時実行数を絞るためのセマフォに加え、
// 連続するリクエスト間に最小間隔を設けて突発的なバーストも抑える。

const MAX_GLOBAL_CONCURRENT = 1;
const MIN_REQUEST_INTERVAL_MS = 100; // 最大 ~10 req/sec
let globalInFlight = 0;
const globalQueue: Array<() => void> = [];
let lastRequestStartedAt = 0;

async function acquireGlobalSlot(): Promise<void> {
  if (globalInFlight < MAX_GLOBAL_CONCURRENT) {
    globalInFlight++;
  } else {
    await new Promise<void>((resolve) => globalQueue.push(resolve));
    globalInFlight++;
  }
  // 連続リクエスト間の最小インターバル
  const now = Date.now();
  const elapsed = now - lastRequestStartedAt;
  if (elapsed < MIN_REQUEST_INTERVAL_MS) {
    await new Promise<void>((r) => setTimeout(r, MIN_REQUEST_INTERVAL_MS - elapsed));
  }
  lastRequestStartedAt = Date.now();
}

function releaseGlobalSlot(): void {
  globalInFlight--;
  const next = globalQueue.shift();
  if (next) next();
}

/**
 * 429 がリトライ予算を使い切ったときに投げる専用エラー。
 * route ハンドラ側で「モックフォールバックせず HTTP 429 を返す」分岐に使う。
 */
export class JQuantsRateLimitError extends Error {
  retryAfterSeconds: number;
  constructor(retryAfterSeconds: number, message?: string) {
    super(message || `J-Quants レート制限が継続中です (再試行まで ${retryAfterSeconds} 秒)`);
    this.name = 'JQuantsRateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
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

// 429 (Rate limit) の場合は指数バックオフでリトライ。
// signal が abort された時点で即座に中断する（呼び出し側の deadline 用）。
// グローバルセマフォと併用してプロセス全体の同時実行数を絞る。
//
// `Retry-After` ヘッダーが返ってきた場合はそれを優先する（サーバの指示に従う）。
async function fetchWithRateLimitRetry(
  url: string,
  init: RequestInit,
  maxRetries = 4,
): Promise<Response> {
  if (init.signal?.aborted) {
    throw new DOMException('Aborted before start', 'AbortError');
  }
  await acquireGlobalSlot();
  try {
    let attempt = 0;
    for (;;) {
      if (init.signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      const res = await fetch(url, init);
      if (res.status !== 429) return res;
      if (attempt >= maxRetries) return res; // 呼び出し側で 429 として処理させる
      // Retry-After を優先、なければ指数バックオフ (2s, 4s, 8s, 16s)
      const retryAfterHeader = res.headers.get('retry-after');
      let waitMs: number;
      if (retryAfterHeader) {
        const sec = parseInt(retryAfterHeader, 10);
        waitMs = Number.isFinite(sec) && sec > 0 ? Math.min(sec * 1000, 20_000) : 2000;
      } else {
        waitMs = 2000 * Math.pow(2, attempt); // 2s, 4s, 8s, 16s = 30s 合計
      }
      // レスポンス body は読まないと keep-alive 解放されない場合があるため一応消費
      try { await res.text(); } catch { /* ignore */ }
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, waitMs);
        init.signal?.addEventListener(
          'abort',
          () => {
            clearTimeout(t);
            reject(new DOMException('Aborted during retry wait', 'AbortError'));
          },
          { once: true },
        );
      });
      attempt++;
    }
  } finally {
    releaseGlobalSlot();
  }
}

async function fetchSummaryPaged(
  params: Record<string, string>,
  apiKey: string,
  signal?: AbortSignal,
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
      signal,
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
        const retryAfterHeader = res.headers.get('retry-after');
        const retrySec = retryAfterHeader && Number.isFinite(parseInt(retryAfterHeader, 10))
          ? parseInt(retryAfterHeader, 10)
          : 60; // デフォルト 60 秒待ちを推奨
        throw new JQuantsRateLimitError(
          retrySec,
          `J-Quants レート制限 (429): 取得量が上限を超えました。${retrySec}秒ほど時間を空けて再実行してください。 ${body}`,
        );
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
  signal?: AbortSignal,
): Promise<RawStatementV2[]> {
  const cacheKey = `jqStmtByDate:${date}`;
  const cached = memoryCache.get<RawStatementV2[]>(cacheKey);
  if (cached) return cached;

  const stmts = await fetchSummaryPaged({ date }, apiKey, signal);
  const today = new Date().toISOString().split('T')[0];
  const ttl = date < today ? 7 * 24 * 60 * 60 * 1000 : 60 * 60 * 1000;
  memoryCache.set(cacheKey, stmts, ttl);
  return stmts;
}

/** 銘柄コード指定での書類取得（履歴）。30 日キャッシュ。 */
export async function fetchStatementsByCode(
  code4: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<RawStatementV2[]> {
  const cacheKey = `jqStmtByCode:${code4}`;
  const cached = memoryCache.get<RawStatementV2[]>(cacheKey);
  if (cached) return cached;

  // J-Quants の 5 桁コード仕様（4桁 + 普通株 "0"）。両方試す。
  let stmts = await fetchSummaryPaged({ code: code4 }, apiKey, signal);
  if (stmts.length === 0) {
    stmts = await fetchSummaryPaged({ code: `${code4}0` }, apiKey, signal);
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

/**
 * FinancialStatements 系のうち、連結/単独 × 会計基準 の「同種別」だけを返すキー。
 * 業績修正・配当修正は空文字を返すので、QoQ 用の前四半期検索でこれらを除外できる。
 * 例: 1Q連結JP と 2Q連結JP は両方 "Cons_JP" を返す → 同種別と判定。
 */
function statementVariantKey(docType?: string): string {
  if (!docType) return '';
  const m = docType.match(/^(?:FY|1Q|2Q|3Q)FinancialStatements_(Consolidated|NonConsolidated)_(JP|IFRS|US)/);
  if (!m) return '';
  const cons = m[1] === 'Consolidated' ? 'Cons' : 'NonCons';
  return `${cons}_${m[2]}`;
}

/** target が QQ/YoY 計算可能な「決算/四半期」短信か */
function isQuarterlyOrAnnualStatement(docType?: string): boolean {
  return statementVariantKey(docType) !== '';
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

/**
 * 前四半期 statement を引き当てる。同 FY 内・約 90 日前。
 *
 * **重要**: 業績修正・配当修正書類や、target と異なる連結性/会計基準の書類を
 * 拾わないよう、`statementVariantKey` で厳密にフィルタする。
 * 旧実装は DocType を見ずに同FY+90日窓だけで検索していたため、
 * 同タイミングに業績修正書類があると Sales=0/通期予想値 を「前四半期累計」として
 * 拾い、引き算で異常な QoQ を返していた。
 */
function findPriorQuarterStatement(
  target: RawStatementV2,
  allByCode: RawStatementV2[],
): RawStatementV2 | null {
  const targetVariant = statementVariantKey(target.DocType);
  if (!targetVariant) return null; // target が決算/四半期短信でなければ前四半期は意味なし
  const targetEnd = target.CurPerEn;
  if (!targetEnd) return null;
  const targetEndDt = new Date(targetEnd);
  if (Number.isNaN(targetEndDt.getTime())) return null;
  const targetFy = target.CurFYEn;

  let best: RawStatementV2 | null = null;
  let bestDiff = Number.POSITIVE_INFINITY;

  for (const s of allByCode) {
    if (s === target) continue;
    // 業績修正・配当修正・他連結性・他会計基準は除外
    if (statementVariantKey(s.DocType) !== targetVariant) continue;
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

type StatementField = 'Sales' | 'OP' | 'OdP' | 'NP';

/**
 * 任意の statement に対して、その期の **単四半期値** を返す。
 * - 1Q なら 累計値 (= 単独値)
 * - 2Q+ なら 当期累計 - 同FY内の直前四半期累計
 *   (直前四半期が見つからない or 数値欠損 なら null)
 *
 * 旧実装は QoQ を「単四半期 − 直前累計」で算出していたため、
 * Q3/Q4 で意味のない比率になっていた。これを単四半期 vs 単四半期 に正す。
 */
function singleQuarterValueOf(
  s: RawStatementV2,
  allByCode: RawStatementV2[],
  field: StatementField,
): number | null {
  const cum = toNum(s[field]);
  if (cum === null) return null;
  if (s.CurPerType === '1Q') return cum;
  const prior = findPriorQuarterStatement(s, allByCode);
  if (!prior) return null;
  const priorCum = toNum(prior[field]);
  if (priorCum === null) return null;
  return cum - priorCum;
}

/**
 * 1Q 用: 直前FY末（=Q4）の単四半期値を返す。
 * = 直前FY 通期累計 − 直前FY 3Q累計。
 * 1Q しか手元になく前期FYの開示も無い場合は null。
 *
 * 連結性/会計基準は target と同種別 (Cons_JP 同士など) のみ許容する。
 */
function findPriorFYQ4Single(
  target: RawStatementV2,
  allByCode: RawStatementV2[],
  field: StatementField,
): number | null {
  if (target.CurPerType !== '1Q') return null;
  const targetVariant = statementVariantKey(target.DocType);
  if (!targetVariant) return null;
  const targetFyStart = target.CurFYSt;
  if (!targetFyStart) return null;
  const targetFyStartDt = new Date(targetFyStart);
  if (Number.isNaN(targetFyStartDt.getTime())) return null;

  let priorFy: RawStatementV2 | null = null;
  let bestDiff = Number.POSITIVE_INFINITY;
  for (const s of allByCode) {
    if (s === target) continue;
    if (!s.DocType || !TYPE_FY.test(s.DocType)) continue;
    // 連結性/会計基準が target と一致するもののみ
    if (statementVariantKey(s.DocType) !== targetVariant) continue;
    if (!s.CurFYEn) continue;
    const fyEnDt = new Date(s.CurFYEn);
    if (Number.isNaN(fyEnDt.getTime())) continue;
    // 直前FY末は target FY開始日の前日近辺（±5日許容）
    const diffDays = Math.abs((targetFyStartDt.getTime() - fyEnDt.getTime()) / (24 * 60 * 60 * 1000));
    if (diffDays <= 5 && diffDays < bestDiff) {
      priorFy = s;
      bestDiff = diffDays;
    }
  }
  if (!priorFy) return null;
  return singleQuarterValueOf(priorFy, allByCode, field);
}

interface MapOptions {
  priorYear?: RawStatementV2 | null;
  priorQuarter?: RawStatementV2 | null;
  /**
   * 当該銘柄の全 statements 履歴。単四半期値の算出 (前四半期の累計→単独変換) に必要。
   * 渡されない場合 QoQ は null になる。
   */
  allHistory?: RawStatementV2[];
}

export function mapStatementToEarnings(
  s: RawStatementV2,
  opts: MapOptions = {},
): EarningsData {
  const type = classifyType(s.DocType);
  const code = localCodeTo4(s.Code);
  const time = (s.DiscTime || '').substring(0, 5); // HH:MM
  const isFirstQuarter = s.CurPerType === '1Q';
  const allHistory = opts.allHistory ?? [];
  // 業績修正・配当修正のような書類は Sales/OP が予想値 or 空のため、
  // 累計→単独変換も YoY 引き当ても意味を持たない。これらは数値列を全て null で返す。
  const isStatement = isQuarterlyOrAnnualStatement(s.DocType);

  // 累計値（YoY 計算と通期計画進捗用）。決算/四半期短信のときのみ採用。
  const salesCum = isStatement ? toNum(s.Sales) : null;
  const opCum = isStatement ? toNum(s.OP) : null;
  const ordCum = isStatement ? toNum(s.OdP) : null;
  const netCum = isStatement ? toNum(s.NP) : null;

  const prevSalesCum = isStatement && opts.priorYear ? toNum(opts.priorYear.Sales) : null;
  const prevOpCum = isStatement && opts.priorYear ? toNum(opts.priorYear.OP) : null;
  const prevOrdCum = isStatement && opts.priorYear ? toNum(opts.priorYear.OdP) : null;
  const prevNetCum = isStatement && opts.priorYear ? toNum(opts.priorYear.NP) : null;

  // ── QoQ: 単四半期 vs 単四半期 (← 旧実装は単四半期 vs 累計で誤算出していた) ──
  const salesSingle = isStatement ? singleQuarterValueOf(s, allHistory, 'Sales') : null;
  const opSingle = isStatement ? singleQuarterValueOf(s, allHistory, 'OP') : null;
  const ordSingle = isStatement ? singleQuarterValueOf(s, allHistory, 'OdP') : null;
  const netSingle = isStatement ? singleQuarterValueOf(s, allHistory, 'NP') : null;

  // 比較先: 通常は同FY内の直前四半期の単独値。
  // 1Q なら 直前FY末 (Q4) の単独値を比較先にする (有用な「前期比」)。
  // priorQuarter は呼び出し側でも variant 一致を保証するため、
  // ここでは singleQuarterValueOf に委譲（その内部で findPriorQuarterStatement が variant 一致を強制）。
  const priorQ = opts.priorQuarter ?? null;
  const prevSalesSingle = !isStatement ? null
    : isFirstQuarter
      ? findPriorFYQ4Single(s, allHistory, 'Sales')
      : priorQ ? singleQuarterValueOf(priorQ, allHistory, 'Sales') : null;
  const prevOpSingle = !isStatement ? null
    : isFirstQuarter
      ? findPriorFYQ4Single(s, allHistory, 'OP')
      : priorQ ? singleQuarterValueOf(priorQ, allHistory, 'OP') : null;
  const prevOrdSingle = !isStatement ? null
    : isFirstQuarter
      ? findPriorFYQ4Single(s, allHistory, 'OdP')
      : priorQ ? singleQuarterValueOf(priorQ, allHistory, 'OdP') : null;
  const prevNetSingle = !isStatement ? null
    : isFirstQuarter
      ? findPriorFYQ4Single(s, allHistory, 'NP')
      : priorQ ? singleQuarterValueOf(priorQ, allHistory, 'NP') : null;

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
    salesQQ: pct(salesSingle, prevSalesSingle),
    operatingProfitQQ: pct(opSingle, prevOpSingle),
    ordinaryProfitQQ: pct(ordSingle, prevOrdSingle),
    netProfitQQ: pct(netSingle, prevNetSingle),
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

export interface FetchEarningsResult {
  earnings: EarningsData[];
  /** 後方互換用: incompleteCodes.length に等しい */
  historyTimeoutRemaining: number;
  /**
   * YoY/QoQ がまだ引き当てできなかった銘柄コード（4桁）。
   * クライアントが /api/earnings/refill?code=XXXX で順次補完する用。
   */
  incompleteCodes: string[];
}

/** YYYY-MM-DD を `days` 日ずらして返す（タイムゾーン非依存） */
function shiftYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const ny = dt.getUTCFullYear();
  const nm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const nd = String(dt.getUTCDate()).padStart(2, '0');
  return `${ny}-${nm}-${nd}`;
}

/**
 * 中心日 ± windowDays の範囲で /fins/summary?date=... を順次叩き、
 * 全 statement を返す。`fetchStatementsByDate` 経由なので各日付は 7d キャッシュ。
 * abort されたら即座に中断、個々のエラー（400/週末空など）は黙って飛ばす。
 */
async function fetchDateWindow(
  centerDate: string,
  windowDays: number,
  apiKey: string,
  signal?: AbortSignal,
): Promise<RawStatementV2[]> {
  const out: RawStatementV2[] = [];
  for (let off = -windowDays; off <= windowDays; off++) {
    if (signal?.aborted) break;
    const d = shiftYmd(centerDate, off);
    try {
      const stmts = await fetchStatementsByDate(d, apiKey, signal);
      out.push(...stmts);
    } catch (e) {
      const isAbort = e instanceof Error && (e.name === 'AbortError' || e.message.includes('Aborted'));
      if (isAbort) break;
      // 400 (古すぎる日付) や週末空などは無視して継続
    }
  }
  return out;
}

/** statements を 4桁 code でグルーピング */
function groupByCode(stmts: RawStatementV2[]): Map<string, RawStatementV2[]> {
  const map = new Map<string, RawStatementV2[]>();
  for (const s of stmts) {
    const code = localCodeTo4(s.Code);
    if (!code) continue;
    const arr = map.get(code) ?? [];
    arr.push(s);
    map.set(code, arr);
  }
  return map;
}

/**
 * 指定日の決算短信一覧を取得し、各銘柄の前年同期 statement を引き当てて YoY を算出する。
 *
 * **戦略 (date-pivot)**: 銘柄ごとに /fins/summary?code= を叩く旧方式は、
 * N 銘柄あれば N コール必要で Vercel 60s タイムアウトに到達しがちだった。
 * 代わりに「指定日 - 1年 ± 5日」(11コール) と「指定日 - 90日 ± 7日」(15コール) の
 * 2つの日付窓で /fins/summary?date= をまとめ取りし、全銘柄分の前年/前四半期 statement を
 * 一括で得る。固定コスト ~27 コールで N 銘柄をカバーでき、過去日は 7d キャッシュなので
 * 同じ日付の再オープンや近接日付は実フェッチほぼゼロ。
 *
 * 窓内に前年/前四半期が見当たらない銘柄のみ、予算内で per-code フォールバックを試みる。
 * それでも残る銘柄は incompleteCodes として返し、クライアント側で /api/earnings/refill により
 * 漸進的に埋めてもらう。
 */
export async function fetchEarningsFromJQuants(
  date: string,
  apiKey: string,
  options?: {
    maxConcurrent?: number;
    batchDelayMs?: number;
    deadlineMs?: number;
    priorYearWindowDays?: number;
    priorQuarterWindowDays?: number;
  },
): Promise<FetchEarningsResult> {
  // 残予算は per-code フォールバックでの並列処理だけに使うため、
  // 並列度は低め（実効同時実行はグローバルセマフォ=1 で 1 のまま）。
  const maxConcurrent = options?.maxConcurrent ?? 2;
  const batchDelayMs = options?.batchDelayMs ?? 250;
  // デフォルト 45 秒予算（60 秒関数タイムアウト - 余白 15 秒）
  const deadlineMs = options?.deadlineMs ?? 45_000;
  const priorYearWindowDays = options?.priorYearWindowDays ?? 5;       // ±5 = 11 dates
  const priorQuarterWindowDays = options?.priorQuarterWindowDays ?? 7; // ±7 = 15 dates

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), deadlineMs);
  const signal = controller.signal;

  try {
    const todayStmts = await fetchStatementsByDate(date, apiKey, signal);
    if (todayStmts.length === 0) {
      return { earnings: [], historyTimeoutRemaining: 0, incompleteCodes: [] };
    }

    // 履歴引き当てが必要なのは YoY/QoQ を計算する 決算 と 四半期 のみ
    const codesNeedingHistory = Array.from(
      new Set(
        todayStmts
          .filter((s) => isQuarterlyOrAnnualStatement(s.DocType))
          .map((s) => localCodeTo4(s.Code))
          .filter(Boolean),
      ),
    );

    // ── 日付窓フェッチ (固定コスト) ──
    // - 前年窓: 約1年前 ± 5日 → YoY と 1Q QoQ 用 (1Q QoQ は前FY末を参照)
    // - 前四半期窓: 約90日前 ± 7日 → 2Q/3Q/4Q QoQ 用
    const priorYearCenter = shiftYmd(date, -365);
    const priorQuarterCenter = shiftYmd(date, -90);

    const priorYearWindow = signal.aborted
      ? []
      : await fetchDateWindow(priorYearCenter, priorYearWindowDays, apiKey, signal);
    const priorQuarterWindow = signal.aborted
      ? []
      : await fetchDateWindow(priorQuarterCenter, priorQuarterWindowDays, apiKey, signal);

    const priorYearByCode = groupByCode(priorYearWindow);
    const priorQuarterByCode = groupByCode(priorQuarterWindow);

    function buildPoolForCode(code: string): RawStatementV2[] {
      const out: RawStatementV2[] = [];
      const py = priorYearByCode.get(code);
      if (py) out.push(...py);
      const pq = priorQuarterByCode.get(code);
      if (pq) out.push(...pq);
      return out;
    }

    // ── per-code フォールバックが必要な銘柄を判定 ──
    // 窓だけで YoY (と 2Q+ なら QoQ も) が引ければ十分。
    // どちらかでも欠ける銘柄を per-code 補完候補にする。
    const codesNeedingPerCode: string[] = [];
    for (const code of codesNeedingHistory) {
      const pool = buildPoolForCode(code);
      const todayForCode = todayStmts.filter(
        (s) => localCodeTo4(s.Code) === code && isQuarterlyOrAnnualStatement(s.DocType),
      );
      const allResolved = todayForCode.every((s) => {
        const py = findPriorYearStatement(s, pool);
        if (s.CurPerType === '1Q') return py !== null;
        const pq = findPriorQuarterStatement(s, pool);
        return py !== null && pq !== null;
      });
      if (!allResolved) codesNeedingPerCode.push(code);
    }

    // ── 第2段: per-code フェッチ (残予算内のみ) ──
    const perCodeHistory = new Map<string, RawStatementV2[]>();
    outer: for (let i = 0; i < codesNeedingPerCode.length; i += maxConcurrent) {
      if (signal.aborted) break;
      const batch = codesNeedingPerCode.slice(i, i + maxConcurrent);
      await Promise.all(
        batch.map(async (code) => {
          try {
            const list = await fetchStatementsByCode(code, apiKey, signal);
            perCodeHistory.set(code, list);
          } catch (e) {
            perCodeHistory.set(code, []);
            const isAbort = e instanceof Error && (e.name === 'AbortError' || e.message.includes('Aborted'));
            if (!isAbort) {
              console.warn(`[jq] history fetch failed for ${code}:`, e instanceof Error ? e.message : e);
            }
          }
        }),
      );
      if (signal.aborted) break outer;
      if (i + maxConcurrent < codesNeedingPerCode.length && batchDelayMs > 0) {
        await new Promise((r) => setTimeout(r, batchDelayMs));
      }
    }

    // ── マッピング ──
    const incompleteCodesSet = new Set<string>();
    const results: EarningsData[] = todayStmts.map((s) => {
      const code = localCodeTo4(s.Code);
      const pool: RawStatementV2[] = [...buildPoolForCode(code)];
      const perCode = perCodeHistory.get(code);
      if (perCode) pool.push(...perCode);

      const priorYear = pool.length > 0 ? findPriorYearStatement(s, pool) : null;
      const priorQuarter = pool.length > 0 ? findPriorQuarterStatement(s, pool) : null;

      // 「決算/四半期」かつ YoY が null の銘柄をクライアント補完対象に積む
      // (YoY が取れていれば実用上のメインメトリクスは充足、QoQ 限定欠損は許容)
      if (isQuarterlyOrAnnualStatement(s.DocType) && priorYear === null && code) {
        incompleteCodesSet.add(code);
      }

      return mapStatementToEarnings(s, { priorYear, priorQuarter, allHistory: pool });
    });

    results.sort((a, b) => a.time.localeCompare(b.time));
    const incompleteCodes = Array.from(incompleteCodesSet);
    return {
      earnings: results,
      historyTimeoutRemaining: incompleteCodes.length,
      incompleteCodes,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * 単一銘柄の YoY 補完用。クライアントが /api/earnings/refill 経由で並列に呼び出す想定。
 * 当該日付の statement を取得しつつ、全履歴 (30d キャッシュ) で priorYear/priorQuarter を引き当てる。
 */
export async function fetchEarningsRefillFromJQuants(
  date: string,
  code4: string,
  apiKey: string,
): Promise<EarningsData[]> {
  if (!code4) return [];
  const [dateStmts, history] = await Promise.all([
    fetchStatementsByDate(date, apiKey),
    fetchStatementsByCode(code4, apiKey),
  ]);
  const todayForCode = dateStmts.filter((s) => localCodeTo4(s.Code) === code4);
  if (todayForCode.length === 0) return [];

  const results = todayForCode.map((s) => {
    const priorYear = history.length > 0 ? findPriorYearStatement(s, history) : null;
    const priorQuarter = history.length > 0 ? findPriorQuarterStatement(s, history) : null;
    return mapStatementToEarnings(s, { priorYear, priorQuarter, allHistory: history });
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

    const salesCum = toNum(s.Sales);
    const opCum = toNum(s.OP);
    const netCum = toNum(s.NP);

    const prevSalesCum = priorYear ? toNum(priorYear.Sales) : null;
    const prevOpCum = priorYear ? toNum(priorYear.OP) : null;
    const prevNetCum = priorYear ? toNum(priorYear.NP) : null;

    const isFirstQuarter = s.CurPerType === '1Q';

    // QoQ: 単四半期 vs 単四半期 (同FY内の前Q、もしくは1Qなら前FYのQ4)
    const salesSingle = singleQuarterValueOf(s, ordered, 'Sales');
    const opSingle = singleQuarterValueOf(s, ordered, 'OP');
    const netSingle = singleQuarterValueOf(s, ordered, 'NP');

    const priorQuarter = findPriorQuarterStatement(s, ordered);
    const prevSalesSingle = isFirstQuarter
      ? findPriorFYQ4Single(s, ordered, 'Sales')
      : priorQuarter ? singleQuarterValueOf(priorQuarter, ordered, 'Sales') : null;
    const prevOpSingle = isFirstQuarter
      ? findPriorFYQ4Single(s, ordered, 'OP')
      : priorQuarter ? singleQuarterValueOf(priorQuarter, ordered, 'OP') : null;
    const prevNetSingle = isFirstQuarter
      ? findPriorFYQ4Single(s, ordered, 'NP')
      : priorQuarter ? singleQuarterValueOf(priorQuarter, ordered, 'NP') : null;

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
      salesQQ: pct(salesSingle, prevSalesSingle),
      opQQ: pct(opSingle, prevOpSingle),
      netQQ: pct(netSingle, prevNetSingle),
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
