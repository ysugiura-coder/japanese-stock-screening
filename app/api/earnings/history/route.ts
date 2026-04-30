import { NextRequest, NextResponse } from 'next/server';
import { fetchCompanyHistoryFromJQuants } from '@/lib/api/jquants-statements';
import { mockEarningsData } from '@/lib/data/mock-earnings';
import type { CompanyHistoryResponse, CompanyHistoryEntry } from '@/lib/types/financial';

// J-Quants 認証 + 履歴解析を含むためタイムアウト延長
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
 * GET /api/earnings/history?code=XXXX&source=tdnet|mock
 *
 * 指定銘柄の過去 8 四半期の決算履歴を返す（J-Quants /fins/statements?code=XXXX）。
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = (searchParams.get('code') || '').trim();
    const source = searchParams.get('source') || 'tdnet';

    if (!/^\d{4}$/.test(code)) {
      return NextResponse.json(
        { error: 'code は 4 桁の数字で指定してください' },
        { status: 400, headers: corsHeaders },
      );
    }

    if (source === 'mock') {
      const entries = mockEarningsData
        .filter((d) => d.code === code && (d.type === '決算' || d.type === '四半期'))
        .map<CompanyHistoryEntry>((d) => ({
          periodEnd: d.date,
          filingDate: d.date,
          type: d.type,
          disclosureNumber: '',
          disclosureType: 'モックデータ',
          salesCum: null,
          opProfitCum: null,
          netProfitCum: null,
          salesYY: d.salesYY,
          opYY: d.operatingProfitYY,
          netYY: d.netProfitYY,
          salesQQ: d.salesQQ,
          opQQ: d.operatingProfitQQ,
          netQQ: d.netProfitQQ,
        }))
        .sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));

      const response: CompanyHistoryResponse = {
        code,
        history: entries,
        scannedDates: 0,
        matchedDocs: entries.length,
        source: 'mock',
      };
      return NextResponse.json(response, { headers: corsHeaders });
    }

    const apiKey =
      request.headers.get('x-jquants-api-key') ||
      process.env.JQUANTS_API_KEY ||
      '';

    if (!apiKey) {
      return NextResponse.json(
        { error: 'J-Quants APIキーが必要です。設定ページで登録してください。' },
        { status: 401, headers: corsHeaders },
      );
    }

    const { history, scannedDates, matchedDocs } = await fetchCompanyHistoryFromJQuants(code, apiKey);

    const response: CompanyHistoryResponse = {
      code,
      history,
      scannedDates,
      matchedDocs,
      source: 'tdnet',
      ...(history.length === 0
        ? { warning: '過去 8 四半期で該当書類が見つかりませんでした。新規上場・コード変更等の可能性があります。' }
        : {}),
    };

    return NextResponse.json(response, { headers: corsHeaders });
  } catch (error) {
    console.error('Company history API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500, headers: corsHeaders },
    );
  }
}
