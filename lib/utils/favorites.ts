import { Stock } from '@/lib/types/stock';

const FAVORITES_STORAGE_KEY = 'stock-screening-favorites';

/**
 * お気に入り銘柄を取得
 */
export function getFavorites(): string[] {
  if (typeof window === 'undefined') return [];
  
  try {
    const stored = localStorage.getItem(FAVORITES_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored) as string[];
    }
  } catch (error) {
    console.error('Failed to get favorites:', error);
  }
  
  return [];
}

/**
 * お気に入り銘柄を保存
 */
export function saveFavorites(codes: string[]): void {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(codes));
  } catch (error) {
    console.error('Failed to save favorites:', error);
  }
}

/**
 * お気に入りに追加
 */
export function addFavorite(code: string): void {
  const favorites = getFavorites();
  if (!favorites.includes(code)) {
    favorites.push(code);
    saveFavorites(favorites);
  }
}

/**
 * お気に入りから削除
 */
export function removeFavorite(code: string): void {
  const favorites = getFavorites();
  const filtered = favorites.filter(c => c !== code);
  saveFavorites(filtered);
}

/**
 * お気に入りかどうかチェック
 */
export function isFavorite(code: string): boolean {
  return getFavorites().includes(code);
}

/**
 * お気に入り銘柄のStockデータを取得
 */
export function getFavoriteStocks(allStocks: Stock[]): Stock[] {
  const favoriteCodes = getFavorites();
  return allStocks.filter(stock => favoriteCodes.includes(stock.code));
}
