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
export interface EarningsData {
  date: string; // 日付（YYYY-MM-DD形式）
  time: string; // 時刻
  code: string;
  companyName: string;
  type: '決算' | '業績修正' | '配当修正' | '決算資料' | 'その他';
  salesQQ: number | null; // 売QQ（%）
  operatingProfitQQ: number | null; // 営QQ（%）
  ordinaryProfitQQ: number | null; // 経QQ（%）
  netProfitQQ: number | null; // 利QQ（%）
  salesYY: number | null; // 売YY（%）
  operatingProfitYY: number | null; // 営YY（%）
  ordinaryProfitYY: number | null; // 経YY（%）
  netProfitYY: number | null; // 利YY（%）
  salesCon: number | null; // 売Con（%）
  operatingProfitCon: number | null; // 営Con（%）
  ordinaryProfitCon: number | null; // 経Con（%）
  netProfitCon: number | null; // 利Con（%）
  dividend: number | null; // 配当（円）
  dividendChange: number | null; // 配当前期比（%）
  segments?: SegmentPerformance; // セグメント別業績
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
