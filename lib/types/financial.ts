// 受注情報
export interface OrderData {
  date: string; // 日付（YYYY-MM-DD形式）
  code: string;
  companyName: string;
  quarter: string; // 1Q, 2Q, 3Q, 4Q
  orderValue: number; // 受注高（億円）
  orderYoY: number | null; // 受注YoY（%）
  orderQoQ: number | null; // 受注QoQ（%）
  outstandingOrders: number; // 受注残高（億円）
  outstandingYoY: number | null; // 残YOY（%）
  outstandingQoQ: number | null; // 残QoQ（%）
}

// PTS情報
export interface PTSData {
  rank: number;
  code: string;
  name: string;
  companyName?: string; // 正式社名
  closingPrice: number; // 終値
  ptsPrice: number; // PTS価格
  change: number; // 騰落
  changeRate: number; // 変化率（%）
  volume: number; // 出来高
  news: Array<{
    date: string;
    title: string;
    url?: string; // 適時開示リンク
  }>;
}

// 決算情報
// データソースは J-Quants /fins/statements（TDnet 由来の決算短信）。
// EDINET 由来の有報・四半期報告書は対象外。
export interface EarningsData {
  date: string; // 開示日（YYYY-MM-DD）= J-Quants DisclosedDate
  time: string; // 開示時刻 = J-Quants DisclosedTime
  code: string; // 4桁コード
  companyName: string;
  type: '決算' | '四半期' | '業績修正' | '配当修正' | 'その他';
  salesQQ: number | null; // 売QQ（%）
  operatingProfitQQ: number | null; // 営QQ（%）
  ordinaryProfitQQ: number | null; // 経QQ（%）
  netProfitQQ: number | null; // 利QQ（%）
  salesYY: number | null; // 売YY（%）
  operatingProfitYY: number | null; // 営YY（%）
  ordinaryProfitYY: number | null; // 経YY（%）
  netProfitYY: number | null; // 利YY（%）
  salesCon: number | null; // 売Con（%）— 未接続
  operatingProfitCon: number | null;
  ordinaryProfitCon: number | null;
  netProfitCon: number | null;
  dividend: number | null; // 配当（円）
  dividendChange: number | null; // 配当前期比（%）
  segments?: SegmentPerformance; // セグメント別業績（J-Quantsには含まれないため当面 null）
  // J-Quants 由来の識別情報
  disclosureNumber?: string; // J-Quants DisclosureNumber
  disclosureType?: string;   // J-Quants TypeOfDocument 原文
  periodEnd?: string;        // 当期末日（YYYY-MM-DD）
  fiscalYearEnd?: string;    // 当該会計年度末日
  dataSource?: 'tdnet' | 'mock';
}

// 四半期業績
export interface QuarterlyEarnings {
  period: string; // 決算期
  sales: number; // 売上高（百万円）
  operatingProfit: number; // 営業利益（百万円）
  ordinaryProfit: number; // 経常利益（百万円）
  netProfit: number; // 純利益（百万円）
  eps: number; // 1株益
  operatingMargin: number; // 営業率（%）
}

// 銘柄の決算履歴エントリ（過去N四半期推移用）
// J-Quants /fins/statements?code=XXXX から実データで取得する。単位は円。
export interface CompanyHistoryEntry {
  periodEnd: string; // 当期末日（YYYY-MM-DD）
  filingDate: string; // 開示日（YYYY-MM-DD）
  type: EarningsData['type'];
  disclosureNumber: string;
  disclosureType: string;
  // 累計絶対値（当期、単位=円）
  salesCum: number | null;
  opProfitCum: number | null;
  netProfitCum: number | null;
  // 前年同期比 (%)
  salesYY: number | null;
  opYY: number | null;
  netYY: number | null;
  // 前四半期比 (%)
  salesQQ: number | null;
  opQQ: number | null;
  netQQ: number | null;
  // 通期計画（会社予想）
  salesForecast?: number | null;
  opProfitForecast?: number | null;
  netProfitForecast?: number | null;
}

// /api/earnings/history のレスポンス
export interface CompanyHistoryResponse {
  code: string;
  history: CompanyHistoryEntry[];
  scannedDates: number; // 取得対象期間の便宜表現（J-Quants は code 単位で一括取得）
  matchedDocs: number;  // マッチした書類数
  source: 'tdnet' | 'mock';
  warning?: string;
}

// セグメント別業績
export interface SegmentPerformance {
  period: string;
  segments: {
    name: string;
    sales: number;
    profit: number;
    salesYoY?: number | null; // 売上YoY変化率（%）
    profitYoY?: number | null; // 利益YoY変化率（%）
  }[];
}
