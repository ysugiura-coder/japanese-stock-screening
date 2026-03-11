// 銘柄の基本情報
export interface Stock {
  code: string; // 銘柄コード
  name: string; // 銘柄名
  market: string; // 市場区分
  price: number; // 現在の株価
  marketCap: number; // 時価総額
  volume: number; // 出来高
  per: number | null; // PER（株価収益率）
  pbr: number | null; // PBR（株価純資産倍率）
  roe: number | null; // ROE（自己資本利益率）
  dividendYield: number | null; // 配当利回り（%）
  updatedAt: string; // 更新日時
}

// スクリーニング条件
export interface ScreeningCriteria {
  codes?: string[]; // 銘柄コード指定（複数可）
  per?: {
    min?: number;
    max?: number;
  };
  pbr?: {
    min?: number;
    max?: number;
  };
  roe?: {
    min?: number;
    max?: number;
  };
  dividendYield?: {
    min?: number;
    max?: number;
  };
  marketCap?: {
    min?: number;
    max?: number;
  };
  volume?: {
    min?: number;
    max?: number;
  };
  price?: {
    min?: number;
    max?: number;
  };
  favoritesOnly?: boolean; // お気に入りのみ表示
}

// 更新頻度設定
export type UpdateInterval = 'manual' | '1h' | '6h' | '12h' | '24h';

export interface UpdateSettings {
  interval: UpdateInterval;
  lastUpdate?: string;
  nextUpdate?: string;
}

// APIレスポンス
export interface StocksResponse {
  stocks: Stock[];
  total: number;
  updatedAt: string;
}

export interface UpdateResponse {
  success: boolean;
  message: string;
  updatedAt?: string;
}

// ソート関連
export type SortField = keyof Stock;
export type SortDirection = 'asc' | 'desc';
