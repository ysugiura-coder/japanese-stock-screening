import { NextRequest, NextResponse } from 'next/server';
import {
  fetchEarningsRefillFromJQuants,
  JQuantsRateLimitError,
} from '@/lib/api/jquants-statements';

// 単一銘柄の YoY/QoQ を再計算するだけなので軽量。タイムアウトは控えめに。
export const maxDuration = 30;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-jquants-api-key',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

/**
 * GET /api/earnings/refill?date=YYYY-MM-DD&code=XXXX
 *
 * /api/earnings の date-pivot 取得で引き当てられなかった銘柄を、
 * クライアント側からスロットル付き並列で叩いて漸進的に補完するためのエンドポイント。
 * サーバ側は per-code 30 日キャッシュを使うので、温まれば実フェッチほぼゼロ。
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    const code = searchParams.get('code');

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json(
        { error: 'date パラメータが不正です (YYYY-MM-DD)' },
        { status: 400, headers: corsHeaders },
      );
    }
    if (!code || !/^\d{4}$/.test(code)) {
      return NextResponse.json(
        { error: 'code パラメータが不正です (4桁数字)' },
        { status: 400, headers: corsHeaders },
      );
    }

    const apiKey =
      request.headers.get('x-jquants-api-key') ||
      process.env.JQUANTS_API_KEY ||
      '';
    if (!apiKey) {
      return NextResponse.json(
        { error: 'J-Quants APIキー未設定' },
        { status: 401, headers: corsHeaders },
      );
    }

    try {
      const earnings = await fetchEarningsRefillFromJQuants(date, code, apiKey);
      const earningsWithSource = earnings.map((e) => ({
        ...e,
        dataSource: 'tdnet' as const,
      }));
      return NextResponse.json(
        { earnings: earningsWithSource, code, date },
        { headers: corsHeaders },
      );
    } catch (error) {
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
      console.error('[refill] J-Quants fetch error:', error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : String(error) },
        { status: 502, headers: corsHeaders },
      );
    }
  } catch (error) {
    console.error('[refill] route error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders },
    );
  }
}
