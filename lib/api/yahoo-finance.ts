import { Stock } from '@/lib/types/stock';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ── Cookie / Crumb 管理 ──────────────────────────────────
let cachedCrumb: string | null = null;
let cachedCookie: string | null = null;
let crumbExpiry = 0;

/**
 * Yahoo Finance API の認証に必要な crumb と cookie を取得する
 */
async function getCrumbAndCookie(): Promise<{ crumb: string; cookie: string }> {
  if (cachedCrumb && cachedCookie && Date.now() < crumbExpiry) {
    return { crumb: cachedCrumb, cookie: cachedCookie };
  }

  // 1. fc.yahoo.com にアクセスして Set-Cookie を取得
  const initRes = await fetch('https://fc.yahoo.com/', {
    headers: { 'User-Agent': UA },
    redirect: 'manual',
  });
  const setCookieHeader = initRes.headers.get('set-cookie') || '';
  const cookie = setCookieHeader.split(';')[0]; // 最初の cookie 値だけ取得

  // 2. crumb を取得
  const crumbRes = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
    headers: {
      'User-Agent': UA,
      'Cookie': cookie,
    },
  });
  const crumb = await crumbRes.text();

  if (!crumb || crumb.includes('error') || crumb.includes('{')) {
    throw new Error(`Failed to get Yahoo Finance crumb: ${crumb}`);
  }

  cachedCrumb = crumb;
  cachedCookie = cookie;
  crumbExpiry = Date.now() + 10 * 60 * 1000; // 10分キャッシュ

  console.log(`Yahoo Finance crumb obtained: ${crumb.substring(0, 6)}...`);
  return { crumb, cookie };
}

// ── Screener API（全銘柄一括取得）─────────────────────────
interface ScreenerQuote {
  symbol: string;
  shortName?: string;
  longName?: string;
  regularMarketPrice?: number;
  marketCap?: number;
  regularMarketVolume?: number;
  trailingPE?: number;
  priceToBook?: number;
  dividendYield?: number;
  epsTrailingTwelveMonths?: number;
  bookValue?: number;
  fullExchangeName?: string;
}

/**
 * Yahoo Finance Screener API で東証全銘柄を一括取得（250件ずつ）
 */
async function fetchAllJPXStocks(): Promise<ScreenerQuote[]> {
  const { crumb, cookie } = await getCrumbAndCookie();
  const allQuotes: ScreenerQuote[] = [];
  const pageSize = 250;
  let offset = 0;
  let total = Infinity;

  while (offset < total) {
    const url = `https://query2.finance.yahoo.com/v1/finance/screener?crumb=${encodeURIComponent(crumb)}&lang=ja-JP&region=JP`;
    const body = {
      size: pageSize,
      offset,
      sortField: 'intradaymarketcap',
      sortType: 'DESC',
      quoteType: 'EQUITY',
      query: {
        operator: 'AND',
        operands: [{ operator: 'eq', operands: ['exchange', 'JPX'] }],
      },
      userId: '',
      userIdType: 'guid',
    };

    console.log(`Screener: fetching offset=${offset}...`);
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'User-Agent': UA,
        'Content-Type': 'application/json',
        'Cookie': cookie,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      // crumb 期限切れの場合はリフレッシュして1度だけリトライ
      if (res.status === 401 && offset === 0) {
        console.warn('Crumb expired, refreshing...');
        cachedCrumb = null;
        cachedCookie = null;
        crumbExpiry = 0;
        return fetchAllJPXStocks();
      }
      throw new Error(`Screener API error (${res.status}): ${errText.substring(0, 200)}`);
    }

    const data = await res.json();
    const result = data.finance?.result?.[0];
    if (!result) {
      console.warn('Screener returned no result');
      break;
    }

    total = result.total || 0;
    const quotes: ScreenerQuote[] = result.quotes || [];
    allQuotes.push(...quotes);
    console.log(`Screener: fetched ${quotes.length} (total so far: ${allQuotes.length}/${total})`);

    offset += pageSize;

    // レート制限対策
    if (offset < total) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  return allQuotes;
}

// ── メインの公開関数 ────────────────────────────────────
/**
 * Yahoo Finance Screener API を使って東証全銘柄（約3,900銘柄）を取得
 */
export async function fetchStocksFromYahooFinance(): Promise<Stock[]> {
  console.log('=== Yahoo Finance: Starting full JPX stock fetch via Screener API ===');

  const quotes = await fetchAllJPXStocks();
  console.log(`Screener returned ${quotes.length} stocks total`);

  const now = new Date().toISOString();

  const stocks: Stock[] = quotes
    .filter(q => q.regularMarketPrice && q.regularMarketPrice > 0)
    .map(q => {
      const code = (q.symbol || '').replace('.T', '');

      // ROE 計算: EPS / BookValue (比率 → %)
      let roe: number | null = null;
      if (
        q.epsTrailingTwelveMonths != null &&
        q.bookValue != null &&
        q.bookValue > 0
      ) {
        roe = Math.round((q.epsTrailingTwelveMonths / q.bookValue) * 100 * 100) / 100;
      }

      // 配当利回り: Screener API はパーセンテージ形式（2.74 = 2.74%）で返す
      let dividendYield: number | null = null;
      if (q.dividendYield != null && q.dividendYield > 0) {
        dividendYield = Math.round(q.dividendYield * 100) / 100;
      }

      return {
        code,
        name: q.longName || q.shortName || code,
        market: q.fullExchangeName || 'JPX',
        price: q.regularMarketPrice || 0,
        marketCap: q.marketCap || 0,
        volume: q.regularMarketVolume || 0,
        per: q.trailingPE != null ? Math.round(q.trailingPE * 100) / 100 : null,
        pbr: q.priceToBook != null ? Math.round(q.priceToBook * 100) / 100 : null,
        roe,
        dividendYield,
        updatedAt: now,
      };
    });

  console.log(`=== Yahoo Finance: ${stocks.length} valid stocks with price data ===`);
  return stocks;
}
