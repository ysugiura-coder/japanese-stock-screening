// EDINET API V2 クライアント
// https://disclosure.edinet-fsa.go.jp/api/v2/

import JSZip from 'jszip';
import { EarningsData } from '@/lib/types/financial';

const EDINET_BASE_URL = 'https://disclosure.edinet-fsa.go.jp/api/v2';

// ========== 型定義 ==========

interface EdinetDocument {
  seqNumber: number;
  docID: string;
  edinetCode: string;
  secCode: string | null;
  JCN: string | null;
  filerName: string;
  fundCode: string | null;
  ordinanceCode: string;
  formCode: string;
  docTypeCode: string;
  periodStart: string | null;
  periodEnd: string | null;
  submitDateTime: string;
  docDescription: string;
  issuerEdinetCode: string | null;
  subjectEdinetCode: string | null;
  subsidiaryEdinetCode: string | null;
  currentReportReason: string | null;
  parentDocID: string | null;
  opeDateTime: string | null;
  withdrawalStatus: string;
  docInfoEditStatus: string;
  disclosureStatus: string;
  xbrlFlag: string;
  pdfFlag: string;
  attachDocFlag: string;
  englishDocFlag: string;
  csvFlag: string;
}

interface EdinetDocumentListResponse {
  metadata: {
    title: string;
    parameter: { date: string; type: string };
    resultset: { count: number };
    processDateTime: string;
    status: string;
    message: string;
  };
  results: EdinetDocument[];
}

/** XBRLから抽出した財務データ */
interface FinancialSummary {
  // YoY変化率（%）- XBRL内に直接含まれる場合
  salesYoYPct?: number;
  opProfitYoYPct?: number;
  ordProfitYoYPct?: number;
  netProfitYoYPct?: number;
  // 当期累計 絶対値
  salesCum?: number;
  opProfitCum?: number;
  ordProfitCum?: number;
  netProfitCum?: number;
  // 前期累計 絶対値
  prevSalesCum?: number;
  prevOpProfitCum?: number;
  prevOrdProfitCum?: number;
  prevNetProfitCum?: number;
  // 当四半期単独 絶対値
  salesQ?: number;
  opProfitQ?: number;
  ordProfitQ?: number;
  netProfitQ?: number;
  // 前四半期単独 絶対値
  prevSalesQ?: number;
  prevOpProfitQ?: number;
  prevOrdProfitQ?: number;
  prevNetProfitQ?: number;
  // 配当
  dividend?: number;
  prevDividend?: number;
}

// ========== 書類一覧取得 ==========

const KESSAN_PATTERN = /決算短信/;
const GYOSEKI_PATTERN = /業績予想.*修正|修正.*業績予想/;
const HAITO_PATTERN = /配当予想.*修正|修正.*配当予想/;

export async function fetchEdinetDocumentList(
  date: string,
  apiKey: string,
): Promise<EdinetDocument[]> {
  const url = `${EDINET_BASE_URL}/documents.json?date=${date}&type=2&Subscription-Key=${apiKey}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });

  if (!res.ok) {
    if (res.status === 404) return [];
    throw new Error(`EDINET API error: ${res.status} ${res.statusText}`);
  }

  const data: EdinetDocumentListResponse = await res.json();
  if (data.metadata.status !== '200') {
    throw new Error(`EDINET API: ${data.metadata.status} - ${data.metadata.message}`);
  }
  return data.results || [];
}

export function filterEarningsDocuments(docs: EdinetDocument[]): EdinetDocument[] {
  return docs.filter((d) => {
    if (!d.secCode) return false;
    if (d.withdrawalStatus === '1') return false;
    const desc = d.docDescription || '';
    if (KESSAN_PATTERN.test(desc)) return true;
    if (GYOSEKI_PATTERN.test(desc)) return true;
    if (HAITO_PATTERN.test(desc)) return true;
    if (['120', '130', '140'].includes(d.docTypeCode)) return true;
    return false;
  });
}

// ========== XBRL パーサー ==========

/**
 * XBRL (type=1) をダウンロードしてパース。
 * ZIP 内の .xbrl / .xml ファイルから財務要素を正規表現で抽出。
 */
export async function fetchAndParseXbrl(
  docID: string,
  apiKey: string,
): Promise<FinancialSummary | null> {
  try {
    const url = `${EDINET_BASE_URL}/documents/${docID}?type=1&Subscription-Key=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) return null;

    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('octet-stream') && !ct.includes('zip')) return null;

    const buf = await res.arrayBuffer();
    const zip = await JSZip.loadAsync(buf);

    // ZIP 内の XBRL インスタンスを探す
    let xbrlText = '';
    for (const [name, file] of Object.entries(zip.files)) {
      if (file.dir) continue;
      // XBRL インスタンスファイルを探す（PublicDoc フォルダ内の .xbrl）
      if (
        (name.endsWith('.xbrl') || name.endsWith('.xml')) &&
        !name.includes('manifest') &&
        !name.includes('linkbase') &&
        !name.includes('schema') &&
        !name.includes('_cal') &&
        !name.includes('_def') &&
        !name.includes('_lab') &&
        !name.includes('_pre') &&
        !name.includes('_ref')
      ) {
        const text = await file.async('text');
        // 有効な XBRL かチェック（売上 or 利益要素が含まれるか）
        if (text.includes('NetSales') || text.includes('Revenue') || text.includes('OperatingIncome') || text.includes('ChangeIn')) {
          xbrlText = text;
          break;
        }
      }
    }

    if (!xbrlText) {
      // iXBRL (HTM) ファイルも探す
      for (const [name, file] of Object.entries(zip.files)) {
        if (file.dir) continue;
        if (name.endsWith('.htm') || name.endsWith('.html')) {
          const text = await file.async('text');
          if (text.includes('ix:nonFraction') || text.includes('ix:nonfraction')) {
            xbrlText = text;
            break;
          }
        }
      }
    }

    if (!xbrlText) return null;
    return parseXbrlContent(xbrlText);
  } catch (e) {
    console.error(`XBRL parse error for ${docID}:`, e);
    return null;
  }
}

/**
 * XBRL / iXBRL テキストから財務要素を抽出
 */
function parseXbrlContent(xml: string): FinancialSummary | null {
  const summary: FinancialSummary = {};
  let found = false;

  // ---------- 1. YoY 変化率（%）を直接取得 ----------
  // 決算短信 XBRL には ChangeIn* 要素が含まれることが多い
  const yoyPatterns: Array<{ re: RegExp; key: keyof FinancialSummary }> = [
    { re: /ChangeIn(?:Net)?Sales[^>]*?>\s*([-\d.]+)\s*</gi, key: 'salesYoYPct' },
    { re: /ChangeInOperating(?:Income|Profit)[^>]*?>\s*([-\d.]+)\s*</gi, key: 'opProfitYoYPct' },
    { re: /ChangeInOrdinary(?:Income|Profit)[^>]*?>\s*([-\d.]+)\s*</gi, key: 'ordProfitYoYPct' },
    { re: /ChangeIn(?:Net)?(?:Income|Profit)[^>]*?(?!Operating|Ordinary)[^>]*?>\s*([-\d.]+)\s*</gi, key: 'netProfitYoYPct' },
  ];
  for (const { re, key } of yoyPatterns) {
    const m = re.exec(xml);
    if (m) {
      const v = parseFloat(m[1]);
      if (!isNaN(v)) { (summary as Record<string, number>)[key] = v; found = true; }
    }
  }

  // ---------- 2. 絶対値の抽出 ----------
  // 要素名 → (contextRef を含む属性文字列, 値) の組をすべて抽出
  // 通常の XBRL:  <ns:ElementName contextRef="..." ...>12345</ns:ElementName>
  // iXBRL:        <ix:nonFraction name="ns:ElementName" contextRef="..." ...>12,345</ix:nonFraction>

  interface XbrlValue { context: string; value: number }
  const elementMap = new Map<string, XbrlValue[]>();

  // 通常の XBRL 要素
  const xbrlRe = /<([a-zA-Z_][\w-]*):([a-zA-Z_][\w-]*)\s+([^>]*?)>\s*([-\d,. ]+)\s*<\//g;
  let match;
  while ((match = xbrlRe.exec(xml)) !== null) {
    const elemName = match[2];
    const attrs = match[3];
    const rawVal = match[4].replace(/[, ]/g, '');
    const numVal = parseFloat(rawVal);
    if (isNaN(numVal)) continue;

    const ctxMatch = attrs.match(/contextRef\s*=\s*"([^"]+)"/);
    if (!ctxMatch) continue;

    const arr = elementMap.get(elemName) || [];
    arr.push({ context: ctxMatch[1], value: numVal });
    elementMap.set(elemName, arr);
  }

  // iXBRL 要素
  const ixRe = /<ix:non[Ff]raction\s+([^>]*?)>\s*([-\d,. ]+)\s*<\/ix:non[Ff]raction>/g;
  while ((match = ixRe.exec(xml)) !== null) {
    const attrs = match[1];
    const rawVal = match[2].replace(/[, ]/g, '');
    const numVal = parseFloat(rawVal);
    if (isNaN(numVal)) continue;

    const nameMatch = attrs.match(/name\s*=\s*"([^"]+)"/);
    const ctxMatch = attrs.match(/contextRef\s*=\s*"([^"]+)"/);
    if (!nameMatch || !ctxMatch) continue;

    const elemName = nameMatch[1].split(':').pop() || '';
    const arr = elementMap.get(elemName) || [];
    arr.push({ context: ctxMatch[1], value: numVal });
    elementMap.set(elemName, arr);
  }

  // ---------- 3. 要素名→フィールドのマッピング ----------
  type PeriodType = 'cum' | 'q';
  type TimeType = 'current' | 'prior';

  function classifyContext(ctx: string): { period: PeriodType; time: TimeType } | null {
    const c = ctx.toLowerCase();
    // 累計 vs 四半期
    const isQuarter = c.includes('quarter') && !c.includes('ytd') && !c.includes('year');
    const period: PeriodType = isQuarter ? 'q' : 'cum';
    // 当期 vs 前期
    if (c.includes('prior') || c.includes('previous') || c.includes('lastyear')) {
      return { period, time: 'prior' };
    }
    if (c.includes('current') || c.includes('thisyear')) {
      return { period, time: 'current' };
    }
    // コンテキストが Current/Prior を含まない場合、Duration で判断
    // 最初にマッチしたものを当期とみなす
    return { period, time: 'current' };
  }

  function pickValue(
    names: string[],
    targetPeriod: PeriodType,
    targetTime: TimeType,
  ): number | undefined {
    for (const name of names) {
      // 完全一致
      const vals = elementMap.get(name);
      if (!vals) continue;
      // コンテキスト分類でフィルタ
      for (const v of vals) {
        const cls = classifyContext(v.context);
        if (!cls) continue;
        if (cls.period === targetPeriod && cls.time === targetTime) return v.value;
      }
      // 期間の区別がつかない場合はフォールバック
      for (const v of vals) {
        const cls = classifyContext(v.context);
        if (!cls) continue;
        if (cls.time === targetTime) return v.value;
      }
    }
    return undefined;
  }

  // 部分一致で要素名を検索
  function findElementNames(pattern: RegExp): string[] {
    const result: string[] = [];
    for (const key of elementMap.keys()) {
      if (pattern.test(key)) result.push(key);
    }
    return result;
  }

  const salesNames = findElementNames(/^(NetSales|Revenue|OperatingRevenue1|Netsales)$/i);
  const opNames = findElementNames(/^(OperatingIncome|OperatingProfit)$/i);
  const ordNames = findElementNames(/^(OrdinaryIncome|OrdinaryProfit)$/i);
  const netNames = findElementNames(/^(ProfitLoss|NetIncome|ProfitLossAttributableToOwnersOfParent|Profit)$/i);
  const divNames = findElementNames(/DividendPerShare|DividendsPerShare/i);

  // 累計
  summary.salesCum = pickValue(salesNames, 'cum', 'current');
  summary.prevSalesCum = pickValue(salesNames, 'cum', 'prior');
  summary.opProfitCum = pickValue(opNames, 'cum', 'current');
  summary.prevOpProfitCum = pickValue(opNames, 'cum', 'prior');
  summary.ordProfitCum = pickValue(ordNames, 'cum', 'current');
  summary.prevOrdProfitCum = pickValue(ordNames, 'cum', 'prior');
  summary.netProfitCum = pickValue(netNames, 'cum', 'current');
  summary.prevNetProfitCum = pickValue(netNames, 'cum', 'prior');

  // 四半期単独
  summary.salesQ = pickValue(salesNames, 'q', 'current');
  summary.prevSalesQ = pickValue(salesNames, 'q', 'prior');
  summary.opProfitQ = pickValue(opNames, 'q', 'current');
  summary.prevOpProfitQ = pickValue(opNames, 'q', 'prior');
  summary.ordProfitQ = pickValue(ordNames, 'q', 'current');
  summary.prevOrdProfitQ = pickValue(ordNames, 'q', 'prior');
  summary.netProfitQ = pickValue(netNames, 'q', 'current');
  summary.prevNetProfitQ = pickValue(netNames, 'q', 'prior');

  // 配当
  summary.dividend = pickValue(divNames, 'cum', 'current') ?? pickValue(divNames, 'q', 'current');
  summary.prevDividend = pickValue(divNames, 'cum', 'prior') ?? pickValue(divNames, 'q', 'prior');

  if (summary.salesCum !== undefined || summary.salesQ !== undefined) found = true;
  if (summary.opProfitCum !== undefined || summary.opProfitQ !== undefined) found = true;

  return found ? summary : null;
}

// ========== YoY / QoQ 計算 ==========

function pct(cur?: number, prev?: number): number | null {
  if (cur === undefined || prev === undefined || prev === 0) return null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

function calcMetrics(fs: FinancialSummary | null) {
  if (!fs) {
    return {
      salesYY: null, opYY: null, ordYY: null, netYY: null,
      salesQQ: null, opQQ: null, ordQQ: null, netQQ: null,
      dividend: null as number | null, dividendChange: null as number | null,
    };
  }

  // YoY: XBRL の ChangeIn* を優先、なければ累計から計算
  const salesYY = fs.salesYoYPct ?? pct(fs.salesCum, fs.prevSalesCum);
  const opYY = fs.opProfitYoYPct ?? pct(fs.opProfitCum, fs.prevOpProfitCum);
  const ordYY = fs.ordProfitYoYPct ?? pct(fs.ordProfitCum, fs.prevOrdProfitCum);
  const netYY = fs.netProfitYoYPct ?? pct(fs.netProfitCum, fs.prevNetProfitCum);

  // QoQ: 四半期単独値があればそこから、なければ累計差分で近似
  const salesQQ = pct(fs.salesQ, fs.prevSalesQ);
  const opQQ = pct(fs.opProfitQ, fs.prevOpProfitQ);
  const ordQQ = pct(fs.ordProfitQ, fs.prevOrdProfitQ);
  const netQQ = pct(fs.netProfitQ, fs.prevNetProfitQ);

  const dividend = fs.dividend ?? null;
  const dividendChange = pct(fs.dividend, fs.prevDividend);

  return { salesYY, opYY, ordYY, netYY, salesQQ, opQQ, ordQQ, netQQ, dividend, dividendChange };
}

// ========== マッピング ==========

export function mapDocumentToEarnings(
  doc: EdinetDocument,
  fs: FinancialSummary | null,
): EarningsData {
  const desc = doc.docDescription || '';
  const secCode = doc.secCode ? doc.secCode.substring(0, 4) : '';

  let type: EarningsData['type'] = 'その他';
  if (KESSAN_PATTERN.test(desc) || ['120', '130', '140'].includes(doc.docTypeCode)) type = '決算';
  else if (GYOSEKI_PATTERN.test(desc)) type = '業績修正';
  else if (HAITO_PATTERN.test(desc)) type = '配当修正';

  const submitDate = doc.submitDateTime?.split(' ')[0] || '';
  const submitTime = doc.submitDateTime?.split(' ')[1] || '';

  const m = calcMetrics(fs);

  return {
    date: submitDate,
    time: submitTime,
    code: secCode,
    companyName: doc.filerName.replace(/株式会社/g, '(株)'),
    type,
    salesQQ: m.salesQQ,
    operatingProfitQQ: m.opQQ,
    ordinaryProfitQQ: m.ordQQ,
    netProfitQQ: m.netQQ,
    salesYY: m.salesYY,
    operatingProfitYY: m.opYY,
    ordinaryProfitYY: m.ordYY,
    netProfitYY: m.netYY,
    salesCon: null,
    operatingProfitCon: null,
    ordinaryProfitCon: null,
    netProfitCon: null,
    dividend: m.dividend,
    dividendChange: m.dividendChange,
    edinetDocId: doc.docID,
    edinetDocDescription: desc,
  };
}

// ========== メインエントリ ==========

export async function fetchEarningsFromEdinet(
  date: string,
  apiKey: string,
  options?: { parseFinancials?: boolean; maxConcurrent?: number },
): Promise<EarningsData[]> {
  const { parseFinancials = true, maxConcurrent = 5 } = options || {};

  const allDocs = await fetchEdinetDocumentList(date, apiKey);
  const earningsDocs = filterEarningsDocuments(allDocs);
  if (earningsDocs.length === 0) return [];

  const results: EarningsData[] = [];

  if (parseFinancials) {
    for (let i = 0; i < earningsDocs.length; i += maxConcurrent) {
      const batch = earningsDocs.slice(i, i + maxConcurrent);
      const batchResults = await Promise.all(
        batch.map(async (doc) => {
          let fs: FinancialSummary | null = null;
          // XBRL があれば XBRL を優先パース
          if (doc.xbrlFlag === '1') {
            fs = await fetchAndParseXbrl(doc.docID, apiKey);
          }
          return mapDocumentToEarnings(doc, fs);
        }),
      );
      results.push(...batchResults);
      if (i + maxConcurrent < earningsDocs.length) {
        await new Promise((r) => setTimeout(r, 300));
      }
    }
  } else {
    for (const doc of earningsDocs) {
      results.push(mapDocumentToEarnings(doc, null));
    }
  }

  results.sort((a, b) => a.time.localeCompare(b.time));
  return results;
}
