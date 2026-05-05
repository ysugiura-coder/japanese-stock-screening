import { NextRequest, NextResponse } from 'next/server';
import { fetchEarningsFromJQuants, JQuantsRateLimitError } from '@/lib/api/jquants-statements';
import { memoryCache } from '@/lib/api/cache';
import { mockEarningsData } from '@/lib/data/mock-earnings';

// J-Quants /fins/statements + 銘柄ごとの履歴フェッチを含むためタイムアウト延長
export const maxDuration = 60;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-jquants-api-key',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

/**
 * GET /api/earnings?date=YYYY-MM-DD&source=tdnet|mock|auto
 *
 * J-Quants APIキー（リフレッシュトークン）はリクエストヘッダー
 * (x-jquants-api-key) で渡す。サーバ側で環境変数 JQUANTS_API_KEY もフォールバック。
 * APIキーが未設定、または source=mock の場合はモックデータを返却。
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0];
    const source = searchParams.get('source') || 'auto';
    const clearCache = searchParams.get('clearCache') === 'true';

    const apiKey =
      request.headers.get('x-jquants-api-key') ||
      process.env.JQUANTS_API_KEY ||
      '';

    const cacheKey = `earningsResp:${date}:${source}`;
    if (!clearCache) {
      const cached = memoryCache.get<ReturnType<typeof buildResponse>>(cacheKey);
      if (cached) return NextResponse.json(cached, { headers: corsHeaders });
    }

    // source=mock または APIキー未設定（auto時）→ モックデータ
    if (source === 'mock' || (!apiKey && source === 'auto')) {
      const mockData = mockEarningsData
        .filter((d) => d.date === date)
        .map((d) => ({ ...d, dataSource: 'mock' as const }));

      const response = buildResponse(mockData, date, 'mock');
      memoryCache.set(cacheKey, response, 24 * 60 * 60 * 1000);
      return NextResponse.json(response, { headers: corsHeaders });
    }

    // J-Quants TDnet からデータ取得
    if (source === 'tdnet' || source === 'auto') {
      try {
        const { earnings, incompleteCodes } = await fetchEarningsFromJQuants(date, apiKey, {
          maxConcurrent: 3,
          batchDelayMs: 200,
          // Vercel 60s タイムアウト - 余白 15s = 45s 予算
          deadlineMs: 45_000,
        });
        const earningsWithSource = earnings.map((e) => ({
          ...e,
          dataSource: 'tdnet' as const,
        }));

        // 未補完銘柄はクライアント側で /api/earnings/refill により順次埋まるため、
        // ここでの警告文は控えめにする (ユーザは「自動補完中」UI で進捗を確認できる)。
        const warning =
          incompleteCodes.length > 0
            ? `${incompleteCodes.length} 銘柄の YoY をバックグラウンドで補完中...`
            : undefined;

        const response = {
          ...buildResponse(earningsWithSource, date, 'tdnet', warning),
          incompleteCodes,
        };
        // 部分結果のときは短めにキャッシュして再フェッチを促す
        const today = new Date().toISOString().split('T')[0];
        const fullTtl = date < today ? 7 * 24 * 60 * 60 * 1000 : 60 * 60 * 1000;
        const partialTtl = 60 * 1000; // 部分結果は 1 分
        memoryCache.set(cacheKey, response, incompleteCodes.length > 0 ? partialTtl : fullTtl);
        return NextResponse.json(response, { headers: corsHeaders });
      } catch (error) {
        console.error('J-Quants statements fetch error:', error);

        // 429 (レート制限) は一時的・再試行で解決可能。
        // モックフォールバックすると投資家に「実データらしき何か」を見せてしまうため、
        // 必ず 429 を伝えてフロント側で再試行 UI を出させる。
        if (error instanceof JQuantsRateLimitError) {
          return NextResponse.json(
            {
              error: error.message,
              code: 'RATE_LIMITED',
              retryAfter: error.retryAfterSeconds,
            },
            {
              status: 429,
              headers: {
                ...corsHeaders,
                'Retry-After': String(error.retryAfterSeconds),
              },
            },
          );
        }

        // auto: 取得失敗時はモックにフォールバックし warning を載せる
        if (source === 'auto') {
          const mockData = mockEarningsData
            .filter((d) => d.date === date)
            .map((d) => ({ ...d, dataSource: 'mock' as const }));
          const response = buildResponse(
            mockData,
            date,
            'mock',
            `J-Quants 取得失敗: ${error instanceof Error ? error.message : String(error)}`,
          );
          return NextResponse.json(response, { headers: corsHeaders });
        }

        return NextResponse.json(
          { error: `J-Quants API error: ${error instanceof Error ? error.message : String(error)}` },
          { status: 502, headers: corsHeaders },
        );
      }
    }

    return NextResponse.json(
      { error: `Unknown source: ${source}` },
      { status: 400, headers: corsHeaders },
    );
  } catch (error) {
    console.error('Earnings API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders },
    );
  }
}

function buildResponse(
  earnings: Array<Record<string, unknown>>,
  date: string,
  source: string,
  warning?: string,
) {
  return {
    earnings,
    total: earnings.length,
    date,
    source,
    updatedAt: new Date().toISOString(),
    ...(warning ? { warning } : {}),
  };
}
