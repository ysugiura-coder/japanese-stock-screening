import { Stock } from '@/lib/types/stock';
import { fetchStocksFromYahooFinance } from './yahoo-finance';

const isDev = process.env.NODE_ENV !== 'production';

/**
 * データソースから銘柄データを取得
 * 優先順位:
 *   1. J-Quants API Version 1 (email/password)
 *   2. J-Quants API Version 2 (API key)
 *   3. Yahoo Finance Screener API（全銘柄取得）
 *   4. モックデータ（最終フォールバック）
 */
export async function fetchStocksFromJQuants(
  email?: string,
  password?: string,
  apiKey?: string,
  apiBase?: string
): Promise<Stock[]> {
  const effectiveEmail = email || process.env.JQUANTS_EMAIL || '';
  const effectivePassword = password || process.env.JQUANTS_PASSWORD || '';
  const effectiveApiKey = apiKey || process.env.JQUANTS_API_KEY || '';
  const effectiveApiBase = apiBase || process.env.JQUANTS_API_BASE || 'https://api.jquants.com/v1';

  if (isDev) {
    console.log('fetchStocksFromJQuants — auth:', effectiveApiKey ? 'apikey' : effectiveEmail ? 'email' : 'none');
  }

  // ── 1. J-Quants Version 1: email/password ──
  if (effectiveEmail && effectivePassword) {
    try {
      const { fetchStocksFromJQuantsAPI } = await import('./jquants-implementation');
      const stocks = await fetchStocksFromJQuantsAPI(effectiveEmail, effectivePassword, undefined, effectiveApiBase);
      if (stocks.length > 0) {
        if (isDev) console.log(`J-Quants V1: ${stocks.length} stocks`);
        return stocks;
      }
    } catch (error) {
      if (isDev) console.warn('J-Quants V1 failed:', error instanceof Error ? error.message : error);
    }
  }

  // ── 2. J-Quants Version 2: API key ──
  if (effectiveApiKey) {
    try {
      const { fetchStocksWithApiKeyV2 } = await import('./jquants-v2');
      const stocks = await fetchStocksWithApiKeyV2(effectiveApiKey, effectiveApiBase);
      if (stocks.length > 0) {
        if (isDev) console.log(`J-Quants V2: ${stocks.length} stocks`);
        return stocks;
      }
    } catch (error) {
      if (isDev) console.warn('J-Quants V2 failed:', error instanceof Error ? error.message : error);
    }
  }

  // ── 3. Yahoo Finance Screener API（全銘柄取得）──
  try {
    const stocks = await fetchStocksFromYahooFinance();
    if (stocks.length > 0) {
      if (isDev) console.log(`Yahoo Finance: ${stocks.length} stocks`);
      return stocks;
    }
  } catch (error) {
    if (isDev) console.warn('Yahoo Finance failed:', error instanceof Error ? error.message : error);
  }

  // ── 4. モックデータ（最終フォールバック）──
  if (isDev) console.log('All APIs failed. Using mock data.');
  return getMockStocks();
}

function getMockStocks(): Stock[] {
  const now = new Date().toISOString();
  return [
    { code: '7203', name: 'トヨタ自動車', market: '東証プライム', price: 3500, marketCap: 24000000000000, volume: 5000000, per: 12.5, pbr: 1.2, roe: 9.5, dividendYield: 2.8, updatedAt: now },
    { code: '6758', name: 'ソニーグループ', market: '東証プライム', price: 12500, marketCap: 15000000000000, volume: 3000000, per: 18.3, pbr: 2.1, roe: 11.2, dividendYield: 0.5, updatedAt: now },
    { code: '9984', name: 'ソフトバンクグループ', market: '東証プライム', price: 8500, marketCap: 18000000000000, volume: 8000000, per: 25.6, pbr: 1.8, roe: 7.2, dividendYield: 0.3, updatedAt: now },
    { code: '8306', name: '三菱UFJフィナンシャル・グループ', market: '東証プライム', price: 1200, marketCap: 18000000000000, volume: 10000000, per: 10.2, pbr: 0.6, roe: 5.9, dividendYield: 3.5, updatedAt: now },
    { code: '9983', name: 'ファーストリテイリング', market: '東証プライム', price: 38500, marketCap: 42000000000000, volume: 850000, per: 35.5, pbr: 8.5, roe: 23.9, dividendYield: 0.5, updatedAt: now },
    { code: '8058', name: '三菱商事', market: '東証プライム', price: 6800, marketCap: 12000000000000, volume: 1500000, per: 8.9, pbr: 0.9, roe: 12.5, dividendYield: 4.1, updatedAt: now },
    { code: '6501', name: '日立製作所', market: '東証プライム', price: 9850, marketCap: 9500000000000, volume: 2500000, per: 12.8, pbr: 1.3, roe: 10.1, dividendYield: 2.8, updatedAt: now },
    { code: '7974', name: '任天堂', market: '東証プライム', price: 7850, marketCap: 11000000000000, volume: 850000, per: 18.5, pbr: 3.2, roe: 17.3, dividendYield: 1.2, updatedAt: now },
    { code: '6861', name: 'キーエンス', market: '東証プライム', price: 85000, marketCap: 4000000000000, volume: 100000, per: 45.2, pbr: 12.5, roe: 27.6, dividendYield: 0.4, updatedAt: now },
    { code: '4063', name: '信越化学工業', market: '東証プライム', price: 15200, marketCap: 7500000000000, volume: 500000, per: 22.4, pbr: 3.2, roe: 14.3, dividendYield: 1.8, updatedAt: now },
  ];
}
