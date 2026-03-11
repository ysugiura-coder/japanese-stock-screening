import { Stock } from '@/lib/types/stock';

/**
 * J-Quants APIからリフレッシュトークンを取得
 * J-Quants APIはメールアドレスとパスワードで認証します
 */
async function getRefreshToken(
  email: string,
  password: string,
  apiBase: string
): Promise<string | null> {
  const trimmedEmail = (email || '').trim();
  const trimmedPassword = (password || '').trim();

  if (!trimmedEmail || !trimmedPassword) {
    console.error('Email and password are required for J-Quants API authentication');
    return null;
  }

  try {
    console.log(`Attempting to get refresh token with email: ${trimmedEmail.substring(0, 5)}...`);
    console.log(`API Base URL: ${apiBase}/token/auth_user`);

    const requestBody = {
      mailaddress: trimmedEmail,
      password: trimmedPassword,
    };
    console.log('Request body (email only):', { mailaddress: trimmedEmail, password: '***' });

    const response = await fetch(`${apiBase}/token/auth_user`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    console.log(`Response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Failed to get refresh token: ${response.status}`);
      console.error(`Error response: ${errorText}`);

      try {
        const errorJson = JSON.parse(errorText);
        console.error('Error details:', errorJson);
      } catch (e) {
        // ignore
      }

      if (response.status === 400 && /mailaddress|password|incorrect/i.test(errorText)) {
        throw new Error(
          'J-Quants認証エラー: メールアドレスまたはパスワードが正しくありません。' +
          'J-Quantsに「メールアドレスで登録」したアカウントのパスワードを使用してください。' +
          'Googleログインのみの場合はパスワードが未設定のことがあります。その場合は設定で「APIキー（Version 2）」を選択し、J-Quantsサイトで発行したAPIキーを入力してください。'
        );
      }
      throw new Error(`Failed to get refresh token: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('✓ Successfully obtained refresh token');
    console.log('Refresh token (first 20 chars):', data.refreshToken ? data.refreshToken.substring(0, 20) + '...' : 'null');
    return data.refreshToken;
  } catch (error) {
    console.error('Error getting refresh token:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
    }
    return null;
  }
}

/**
 * J-Quants APIからIDトークンを取得
 */
async function getIdToken(refreshToken: string, apiBase: string): Promise<string | null> {
  if (!refreshToken) {
    console.error('Refresh token is required');
    return null;
  }

  try {
    console.log('Attempting to get ID token...');
    const refreshUrl = `${apiBase}/token/auth_refresh?refreshtoken=${refreshToken}`;
    console.log(`Refresh URL: ${apiBase}/token/auth_refresh?refreshtoken=***`);
    
    const response = await fetch(refreshUrl, {
      method: 'POST',
    });

    console.log(`Response status: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Failed to get ID token: ${response.status}`);
      console.error(`Error response: ${errorText}`);
      
      // エラーメッセージをより詳しく表示
      try {
        const errorJson = JSON.parse(errorText);
        console.error('Error details:', errorJson);
      } catch (e) {
        // JSONパースに失敗した場合はそのまま表示
      }
      
      throw new Error(`Failed to get ID token: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('✓ Successfully obtained ID token');
    console.log('ID token (first 20 chars):', data.idToken ? data.idToken.substring(0, 20) + '...' : 'null');
    return data.idToken;
  } catch (error) {
    console.error('Error getting ID token:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
    }
    return null;
  }
}

/**
 * J-Quants APIから上場銘柄一覧を取得（最大1000銘柄）
 */
async function fetchListedInfo(idToken: string, apiBase: string): Promise<any[]> {
  try {
    const allStocks: any[] = [];
    let page = 1;
    const pageSize = 100; // 1ページあたりの取得件数
    const maxStocks = 1000; // 最大取得件数

    while (allStocks.length < maxStocks) {
      const url = `${apiBase}/listed/info?date=${new Date().toISOString().split('T')[0]}&page=${page}`;
      console.log(`Fetching listed info page ${page}: ${url}`);
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${idToken}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Failed to fetch listed info: ${response.status} - ${errorText}`);
        
        // エラーが発生しても、取得できた分を返す
        if (allStocks.length > 0) {
          console.warn(`Error fetching page ${page}, but continuing with ${allStocks.length} stocks already fetched`);
          break;
        }
        
        throw new Error(`Failed to fetch listed info: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      
      if (!data.info || !Array.isArray(data.info) || data.info.length === 0) {
        console.log(`No more data on page ${page}, stopping pagination`);
        break;
      }

      allStocks.push(...data.info);
      console.log(`Fetched ${data.info.length} stocks from page ${page} (total: ${allStocks.length})`);

      // 1000銘柄に達したら終了
      if (allStocks.length >= maxStocks) {
        console.log(`Reached maximum of ${maxStocks} stocks`);
        return allStocks.slice(0, maxStocks);
      }

      // 次のページがあるかチェック
      if (data.info.length < pageSize) {
        console.log(`Last page reached (${data.info.length} < ${pageSize})`);
        break;
      }

      page++;
      
      // レート制限対策: 少し待機
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log(`Total listed stocks fetched: ${allStocks.length}`);
    return allStocks.slice(0, maxStocks);
  } catch (error) {
    console.error('Error fetching listed info:', error);
    throw error;
  }
}

/**
 * J-Quants APIから株価データを取得
 */
async function fetchPrices(idToken: string, codes: string[], apiBase: string): Promise<any[]> {
  try {
    // バッチで取得（100銘柄ずつ）
    const batchSize = 100;
    const allPrices: any[] = [];
    const totalBatches = Math.ceil(codes.length / batchSize);

    for (let i = 0; i < codes.length; i += batchSize) {
      const batch = codes.slice(i, i + batchSize);
      const codeParam = batch.join(',');
      const batchNumber = Math.floor(i / batchSize) + 1;

      console.log(`Fetching prices batch ${batchNumber}/${totalBatches} (${batch.length} stocks)...`);

      try {
        const response = await fetch(
          `${apiBase}/prices/daily_quotes?code=${codeParam}&date=${new Date().toISOString().split('T')[0]}`,
          {
            headers: {
              'Authorization': `Bearer ${idToken}`,
            },
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.warn(`⚠ Failed to fetch prices for batch ${batchNumber}: ${response.status} - ${errorText}`);
          // エラーが発生しても続行（取得できた分を使用）
          continue;
        }

        const data = await response.json();
        if (data.daily_quotes && Array.isArray(data.daily_quotes)) {
          allPrices.push(...data.daily_quotes);
          console.log(`✓ Fetched ${data.daily_quotes.length} price records from batch ${batchNumber}`);
        } else {
          console.warn(`⚠ Batch ${batchNumber} returned non-array data:`, typeof data.daily_quotes);
        }
      } catch (error) {
        console.error(`✗ Error fetching batch ${batchNumber}:`, error);
        if (error instanceof Error) {
          console.error(`Error message: ${error.message}`);
        }
        // エラーが発生しても続行（取得できた分を使用）
      }

      // レート制限対策
      if (i + batchSize < codes.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log(`Total price records fetched: ${allPrices.length}`);
    return allPrices;
  } catch (error) {
    console.error('Error fetching prices:', error);
    return [];
  }
}

/**
 * J-Quants APIのデータをStock型に変換
 */
function transformJQuantsData(listedInfo: any[], prices: any[]): Stock[] {
  const now = new Date().toISOString();
  const priceMap = new Map<string, any>();
  
  // 価格データをマップ化
  prices.forEach(price => {
    priceMap.set(price.Code, price);
  });

  return listedInfo.map(info => {
    const price = priceMap.get(info.Code);
    
    return {
      code: info.Code,
      name: info.CompanyName || info.Name,
      market: info.Section || '東証プライム',
      price: price?.Close || price?.EndValue || 0,
      marketCap: price?.MarketCapitalization || 0,
      volume: price?.TradingVolume || 0,
      per: price?.PER || null,
      pbr: price?.PBR || null,
      roe: null, // J-Quants APIでは別途取得が必要
      dividendYield: price?.DividendYield || null,
      updatedAt: now,
    };
  });
}

/**
 * J-Quants APIから全銘柄データを取得（最大1000銘柄）
 */
export async function fetchStocksFromJQuantsAPI(
  email?: string,
  password?: string,
  apiKey?: string,
  apiBase?: string
): Promise<Stock[]> {
  const effectiveEmail = email || process.env.JQUANTS_EMAIL || '';
  const effectivePassword = password || process.env.JQUANTS_PASSWORD || '';
  const effectiveApiKey = apiKey || process.env.JQUANTS_API_KEY || '';
  const effectiveApiBase = apiBase || process.env.JQUANTS_API_BASE || 'https://api.jquants.com/v1';

  let idToken: string | null = null;

  // Version 2 APIキー方式の場合
  if (effectiveApiKey && !effectiveEmail) {
    console.log('Using API key authentication (Version 2)');
    // Version 2ではAPIキーを直接使用
    const { fetchStocksWithApiKeyV2 } = await import('./jquants-v2');
    return await fetchStocksWithApiKeyV2(effectiveApiKey, effectiveApiBase);
  }
  // Version 1 メールアドレス/パスワード方式の場合
  else if (effectiveEmail && effectivePassword) {
    console.log(`Using email/password authentication (Version 1): ${effectiveEmail.substring(0, 5)}...`);
    
    // 1. リフレッシュトークンを取得
    const refreshToken = await getRefreshToken(effectiveEmail, effectivePassword, effectiveApiBase);
    if (!refreshToken) {
      throw new Error('Failed to get refresh token');
    }

    // 2. IDトークンを取得
    idToken = await getIdToken(refreshToken, effectiveApiBase);
    if (!idToken) {
      throw new Error('Failed to get ID token');
    }
  } else {
    throw new Error('J-Quants email/password (Version 1) or API key (Version 2) is required');
  }

  if (!idToken) {
    throw new Error('Failed to obtain ID token');
  }

  try {

    // 3. 上場銘柄一覧を取得（最大1000銘柄）
    const listedInfo = await fetchListedInfo(idToken, effectiveApiBase);
    console.log(`Fetched ${listedInfo.length} stocks from J-Quants API`);

    // 4. 銘柄コードのリストを作成
    const codes = listedInfo.map(info => info.Code);

    // 5. 株価データを取得
    const prices = await fetchPrices(idToken, codes, effectiveApiBase);

    // 6. データを変換
    const stocks = transformJQuantsData(listedInfo, prices);

    return stocks;
  } catch (error) {
    console.error('Error fetching stocks from J-Quants API:', error);
    throw error;
  }
}
