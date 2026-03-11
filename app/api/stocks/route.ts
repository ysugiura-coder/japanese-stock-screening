import { NextRequest, NextResponse } from 'next/server';
import { fetchStocksFromJQuants } from '@/lib/api/jquants';
import { memoryCache, CACHE_KEYS } from '@/lib/api/cache';
import { Stock, StocksResponse } from '@/lib/types/stock';
import crypto from 'crypto';

const CACHE_TTL = 6 * 3600000;
const isDev = process.env.NODE_ENV !== 'production';

function hashKey(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex').substring(0, 16);
}

export async function GET(request: NextRequest) {
  try {
    const email = request.headers.get('x-jquants-email') || process.env.JQUANTS_EMAIL || '';
    const password = request.headers.get('x-jquants-password') || process.env.JQUANTS_PASSWORD || '';
    const apiKey = request.headers.get('x-jquants-api-key') || process.env.JQUANTS_API_KEY || '';
    const apiBase = request.headers.get('x-api-base') || process.env.JQUANTS_API_BASE || 'https://api.jquants.com/v1';

    if (isDev) {
      console.log('GET /api/stocks — auth:', apiKey ? 'apikey' : email ? 'email' : 'none');
    }

    const authIdentifier = apiKey || email || 'no-auth';
    const cacheKey = `${CACHE_KEYS.STOCKS}_${hashKey(authIdentifier)}`;

    const clearCache = request.nextUrl.searchParams.get('clearCache') === 'true';
    if (clearCache) {
      memoryCache.delete(cacheKey);
      memoryCache.delete(CACHE_KEYS.STOCKS_UPDATED_AT);
    } else {
      const cachedData = memoryCache.get<StocksResponse>(cacheKey);
      if (cachedData) {
        return NextResponse.json(cachedData);
      }
    }

    let stocks: Stock[];
    try {
      stocks = await fetchStocksFromJQuants(email, password, apiKey, apiBase);
    } catch (error) {
      if (isDev) console.error('fetchStocksFromJQuants error:', error instanceof Error ? error.message : error);
      stocks = [];
    }

    const now = new Date().toISOString();
    const response: StocksResponse = {
      stocks,
      total: stocks.length,
      updatedAt: now,
    };

    memoryCache.set(cacheKey, response, CACHE_TTL);
    memoryCache.set(CACHE_KEYS.STOCKS_UPDATED_AT, now, CACHE_TTL);

    return NextResponse.json(response);
  } catch (error) {
    if (isDev) console.error('GET /api/stocks error:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch stocks',
        message: isDev && error instanceof Error ? error.message : 'Internal server error',
        stocks: [],
        total: 0,
        updatedAt: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
