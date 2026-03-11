import { Stock } from '@/lib/types/stock';

const V2_API_BASE = 'https://api.jquants.com/v2';

/** 400 のメッセージからサブスクリプション終了日を取得（例: "~ 2025-11-27" → "2025-11-27"） */
function parseSubscriptionEndDate(errorBody: string): string | null {
  const m = errorBody.match(/~\s*(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

/**
 * J-Quants API Version 2の実装
 * APIキーで /v2/equities/master と /v2/equities/bars/daily を呼び出します。
 * サブスクリプション期限を超えた日付で 400 が返った場合は、利用可能な終了日で再試行します。
 */
export async function fetchStocksWithApiKeyV2(
  apiKey: string,
  apiBase: string
): Promise<Stock[]> {
  if (!apiKey) {
    throw new Error('API key is required for Version 2');
  }

  const base = (apiBase || V2_API_BASE).replace(/\/v1\/?$/, '/v2').replace(/\/?$/, '');
  const effectiveBase = base.includes('/v2') ? base : `${base}/v2`;

  try {
    console.log('Attempting to fetch stocks with API key (Version 2)...');
    console.log(`API Key: ${apiKey.substring(0, 10)}...`);
    console.log(`Using API Base: ${effectiveBase} (v2 endpoints only)`);

    const today = new Date().toISOString().split('T')[0];
    const maxStocks = 1000;

    const headers: Record<string, string> = {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
    };

    let requestDate = today;
    let retried = false;

    retryLoop: for (;;) {
      const allListedInfo: any[] = [];
      let paginationKey: string | undefined;

      do {
        const url = new URL(`${effectiveBase}/equities/master`);
        url.searchParams.set('date', requestDate);
        if (paginationKey) url.searchParams.set('pagination_key', paginationKey);

        console.log(`Fetching listed info: ${url.toString()}`);
        const listedResponse = await fetch(url.toString(), { headers });

        console.log(`Listed info response status: ${listedResponse.status}`);

        if (!listedResponse.ok) {
          const errorText = await listedResponse.text();
          console.error(`Failed to fetch listed info: ${listedResponse.status} - ${errorText}`);
          if (listedResponse.status === 401) {
            throw new Error(
              `API認証エラー: APIキーが無効または期限切れです。J-QuantsマイページでAPIキーを確認してください。 (${errorText})`
            );
          }
          if (listedResponse.status === 403 || listedResponse.status === 404) {
            throw new Error(`エンドポイントエラー (${listedResponse.status}): ${errorText}`);
          }
          if (listedResponse.status === 400 && !retried) {
            const subscriptionEnd = parseSubscriptionEndDate(errorText);
            if (subscriptionEnd) {
              console.log(`Subscription date limit: using ${subscriptionEnd} instead of ${requestDate}`);
              requestDate = subscriptionEnd;
              retried = true;
              continue retryLoop; // 利用可能な終了日で再試行
            }
          }
          throw new Error(`API呼び出しエラー (${listedResponse.status}): ${errorText}`);
        }

        const listedJson = (await listedResponse.json()) as { data?: any[]; pagination_key?: string };
        const pageData = listedJson.data ?? [];
        paginationKey = listedJson.pagination_key;

        if (Array.isArray(pageData)) {
          allListedInfo.push(...pageData);
          console.log(`Fetched ${pageData.length} listed (total: ${allListedInfo.length})`);
        }

        if (allListedInfo.length >= maxStocks) break;
        if (paginationKey) await new Promise((r) => setTimeout(r, 300));
      } while (paginationKey);

      if (retried && allListedInfo.length === 0) {
        throw new Error(
          `サブスクリプションの有効期限（${requestDate}）を超えています。J-Quantsのプラン・有効期限を確認してください。`
        );
      }

      const limitedListedInfo = allListedInfo.slice(0, maxStocks);
      if (limitedListedInfo.length === 0) {
        console.warn('No listed info from /v2/equities/master');
        return [];
      }

      console.log(`Total listed stocks: ${limitedListedInfo.length} (date: ${requestDate})`);

      // 2. 日足価格: GET /v2/equities/bars/daily?date=YYYY-MM-DD
      const allPrices: any[] = [];
      let pricePaginationKey: string | undefined;

      do {
        const priceUrl = new URL(`${effectiveBase}/equities/bars/daily`);
        priceUrl.searchParams.set('date', requestDate);
        if (pricePaginationKey) priceUrl.searchParams.set('pagination_key', pricePaginationKey);

        console.log(`Fetching daily bars: ${priceUrl.toString()}`);
        const pricesResponse = await fetch(priceUrl.toString(), { headers });

        if (!pricesResponse.ok) {
          const errText = await pricesResponse.text();
          console.warn(`Daily bars response ${pricesResponse.status}: ${errText}`);
          break;
        }

        const pricesJson = (await pricesResponse.json()) as { data?: any[]; pagination_key?: string };
        const priceData = pricesJson.data ?? [];
        pricePaginationKey = pricesJson.pagination_key;

        if (Array.isArray(priceData)) {
          allPrices.push(...priceData);
          console.log(`Fetched ${priceData.length} price rows (total: ${allPrices.length})`);
        }

        if (pricePaginationKey) await new Promise((r) => setTimeout(r, 300));
      } while (pricePaginationKey);

      const priceMap = new Map<string, any>();
      allPrices.forEach((p: any) => {
        const code = p.Code ?? p.code ?? '';
        if (code) priceMap.set(String(code), p);
      });

      const now = new Date().toISOString();

      const stocks: Stock[] = limitedListedInfo.map((info: any) => {
        const code = String(info.Code ?? info.code ?? '');
        const price = priceMap.get(code);
        const close = price?.AdjC ?? price?.C ?? price?.close ?? 0;
        const volume = price?.Vo ?? price?.AdjVo ?? price?.volume ?? 0;

        return {
          code,
          name: info.CoName ?? info.CompanyName ?? info.Name ?? info.name ?? '',
          market: info.MktNm ?? info.Section ?? info.Market ?? '東証プライム',
          price: Number(close) || 0,
          marketCap: 0,
          volume: Number(volume) || 0,
          per: null,
          pbr: null,
          roe: null,
          dividendYield: null,
          updatedAt: now,
        };
      });

      console.log(`✓ Successfully fetched ${stocks.length} stocks from J-Quants API Version 2 (data date: ${requestDate})`);
      return stocks;
    }
  } catch (error) {
    console.error('Error fetching stocks with API key (Version 2):', error);
    if (error instanceof Error) console.error('Error message:', error.message);
    throw error;
  }
}
