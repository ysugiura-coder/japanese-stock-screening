import { NextRequest, NextResponse } from 'next/server';
import { fetchEarningsFromEdinet } from '@/lib/api/edinet';
import { memoryCache } from '@/lib/api/cache';
import { mockEarningsData } from '@/lib/data/mock-earnings';

// Vercel Serverless Function のタイムアウト延長（XBRL解析に時間がかかるため）
export const maxDuration = 60;

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-edinet-api-key',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

/**
 * GET /api/earnings?date=YYYY-MM-DD&source=edinet|mock
 *
 * EDINET APIキーはリクエストヘッダー (x-edinet-api-key) で渡す。
 * APIキーが未設定、またはsource=mockの場合はモックデータを返却。
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0];
    const source = searchParams.get('source') || 'auto';
    const clearCache = searchParams.get('clearCache') === 'true';
    const parseFinancials = searchParams.get('parseFinancials') !== 'false';

    const edinetApiKey = request.headers.get('x-edinet-api-key') || '';

    // キャッシュキー
    const cacheKey = `earnings:${date}:${source}:${parseFinancials}`;

    // キャッシュチェック（clearCacheでバイパス）
    if (!clearCache) {
      const cached = memoryCache.get<ReturnType<typeof buildResponse>>(cacheKey);
      if (cached) {
        return NextResponse.json(cached, { headers: corsHeaders });
      }
    }

    // source=mock または APIキー未設定 → モックデータ
    if (source === 'mock' || (!edinetApiKey && source === 'auto')) {
      const mockData = mockEarningsData
        .filter((d) => d.date === date)
        .map((d) => ({ ...d, dataSource: 'mock' as const }));

      const response = buildResponse(mockData, date, 'mock');
      // モックデータは長めにキャッシュ
      memoryCache.set(cacheKey, response, 24 * 60 * 60 * 1000);
      return NextResponse.json(response, { headers: corsHeaders });
    }

    // EDINET APIからデータ取得
    if (source === 'edinet' || source === 'auto') {
      try {
        const earnings = await fetchEarningsFromEdinet(date, edinetApiKey, {
          parseFinancials,
          maxConcurrent: 5,
        });

        const earningsWithSource = earnings.map((e) => ({
          ...e,
          dataSource: 'edinet' as const,
        }));

        const response = buildResponse(earningsWithSource, date, 'edinet');
        // 過去日付は7日間キャッシュ、当日は1時間キャッシュ
        const today = new Date().toISOString().split('T')[0];
        const ttl = date < today ? 7 * 24 * 60 * 60 * 1000 : 60 * 60 * 1000;
        memoryCache.set(cacheKey, response, ttl);
        return NextResponse.json(response, { headers: corsHeaders });
      } catch (error) {
        console.error('EDINET fetch error:', error);

        // EDINETが失敗した場合、モックにフォールバック
        if (source === 'auto') {
          const mockData = mockEarningsData
            .filter((d) => d.date === date)
            .map((d) => ({ ...d, dataSource: 'mock' as const }));
          const response = buildResponse(mockData, date, 'mock', `EDINET取得失敗: ${error instanceof Error ? error.message : String(error)}`);
          return NextResponse.json(response, { headers: corsHeaders });
        }

        return NextResponse.json(
          { error: `EDINET API error: ${error instanceof Error ? error.message : String(error)}` },
          { status: 502, headers: corsHeaders }
        );
      }
    }

    return NextResponse.json(
      { error: `Unknown source: ${source}` },
      { status: 400, headers: corsHeaders }
    );
  } catch (error) {
    console.error('Earnings API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}

function buildResponse(
  earnings: Array<Record<string, unknown>>,
  date: string,
  source: string,
  warning?: string
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
