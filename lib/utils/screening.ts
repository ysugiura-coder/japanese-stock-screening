import { Stock, ScreeningCriteria, SortField, SortDirection } from '@/lib/types/stock';
import { getFavorites } from './favorites';

/**
 * 銘柄が「上場企業（普通株式）」か判定する。
 * ETF・ETN・REIT・インフラファンド・投資信託等を名称ベースで除外する。
 */
export function isListedCompany(stock: Stock): boolean {
  const name = stock.name || '';
  if (!name) return true;

  // REIT・インフラファンド等の投資法人形態
  if (name.includes('投資法人')) return false;

  // ETF / ETN / 上場投信系のキーワード
  const excludePatterns = [
    'ETF', 'ETN',
    '上場投信', '上場インデックス', '連動型上場投信',
    'NEXT FUNDS', 'MAXIS', 'iShares', 'iFree', 'SPDR',
    'NZAM', 'One ETF', 'ダイワ上場投信', 'Listed Index',
    'グローバルX', 'Global X', 'SMDAM', 'シンプレクス',
    '東証REIT', 'Jリート', 'Ｊリート', 'Jリート', 'J-REIT',
    'ブル2倍', 'ベア2倍', 'レバレッジ上場投信', 'インバース上場投信',
    'ダブルインバース', 'トラッカー',
  ];

  for (const p of excludePatterns) {
    if (name.includes(p)) return false;
  }

  return true;
}

/**
 * 銘柄がスクリーニング条件を満たすかチェック
 */
export function matchesCriteria(stock: Stock, criteria: ScreeningCriteria): boolean {
  // 銘柄コード指定チェック
  if (criteria.codes && criteria.codes.length > 0) {
    if (!criteria.codes.includes(stock.code)) {
      return false;
    }
  }

  // お気に入りのみチェック
  if (criteria.favoritesOnly) {
    // このチェックは呼び出し側で行う（favoritesOnlyの場合は事前にフィルタリング）
  }

  // PERチェック
  if (criteria.per) {
    if (criteria.per.min !== undefined && (stock.per === null || stock.per < criteria.per.min)) {
      return false;
    }
    if (criteria.per.max !== undefined && (stock.per !== null && stock.per > criteria.per.max)) {
      return false;
    }
  }

  // PBRチェック
  if (criteria.pbr) {
    if (criteria.pbr.min !== undefined && (stock.pbr === null || stock.pbr < criteria.pbr.min)) {
      return false;
    }
    if (criteria.pbr.max !== undefined && (stock.pbr !== null && stock.pbr > criteria.pbr.max)) {
      return false;
    }
  }

  // ROEチェック
  if (criteria.roe) {
    if (criteria.roe.min !== undefined && (stock.roe === null || stock.roe < criteria.roe.min)) {
      return false;
    }
    if (criteria.roe.max !== undefined && (stock.roe !== null && stock.roe > criteria.roe.max)) {
      return false;
    }
  }

  // 配当利回りチェック
  if (criteria.dividendYield) {
    if (criteria.dividendYield.min !== undefined && 
        (stock.dividendYield === null || stock.dividendYield < criteria.dividendYield.min)) {
      return false;
    }
    if (criteria.dividendYield.max !== undefined && 
        (stock.dividendYield !== null && stock.dividendYield > criteria.dividendYield.max)) {
      return false;
    }
  }

  // 時価総額チェック
  if (criteria.marketCap) {
    if (criteria.marketCap.min !== undefined && stock.marketCap < criteria.marketCap.min) {
      return false;
    }
    if (criteria.marketCap.max !== undefined && stock.marketCap > criteria.marketCap.max) {
      return false;
    }
  }

  // 出来高チェック
  if (criteria.volume) {
    if (criteria.volume.min !== undefined && stock.volume < criteria.volume.min) {
      return false;
    }
    if (criteria.volume.max !== undefined && stock.volume > criteria.volume.max) {
      return false;
    }
  }

  // 株価チェック
  if (criteria.price) {
    if (criteria.price.min !== undefined && stock.price < criteria.price.min) {
      return false;
    }
    if (criteria.price.max !== undefined && stock.price > criteria.price.max) {
      return false;
    }
  }

  return true;
}

/**
 * スクリーニング実行
 */
export function screenStocks(stocks: Stock[], criteria: ScreeningCriteria): Stock[] {
  let filtered = stocks;

  // 上場企業のみ表示（ETF・REIT等を除外）
  if (criteria.listedOnly) {
    filtered = filtered.filter(isListedCompany);
  }

  // お気に入りのみ表示
  if (criteria.favoritesOnly) {
    const favoriteCodes = getFavorites();
    filtered = filtered.filter(stock => favoriteCodes.includes(stock.code));
  }

  // その他の条件でフィルタリング
  return filtered.filter(stock => matchesCriteria(stock, criteria));
}

/**
 * ソート関数
 */
export function sortStocks(
  stocks: Stock[],
  field: SortField,
  direction: SortDirection
): Stock[] {
  const sorted = [...stocks].sort((a, b) => {
    const aValue = a[field];
    const bValue = b[field];

    // null値の処理
    if (aValue === null && bValue === null) return 0;
    if (aValue === null) return 1;
    if (bValue === null) return -1;

    // 数値比較
    if (typeof aValue === 'number' && typeof bValue === 'number') {
      return direction === 'asc' ? aValue - bValue : bValue - aValue;
    }

    // 文字列比較
    if (typeof aValue === 'string' && typeof bValue === 'string') {
      return direction === 'asc'
        ? aValue.localeCompare(bValue)
        : bValue.localeCompare(aValue);
    }

    return 0;
  });

  return sorted;
}
