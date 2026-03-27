import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/edinet-doc/[docId]?type=2
 *
 * EDINET API V2 のドキュメントダウンロードをプロキシする。
 * type=2 → PDF, type=1 → XBRL ZIP, type=5 → CSV ZIP
 * APIキーはリクエストヘッダー (x-edinet-api-key) で渡す。
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { docId: string } },
) {
  const { docId } = params;
  const apiKey = request.headers.get('x-edinet-api-key') || '';
  const docType = request.nextUrl.searchParams.get('type') || '2'; // デフォルトPDF

  if (!apiKey) {
    return NextResponse.json(
      { error: 'EDINET APIキーが必要です。設定ページで登録してください。' },
      { status: 401 },
    );
  }

  try {
    const url = `https://api.edinet-fsa.go.jp/api/v2/documents/${docId}?type=${docType}&Subscription-Key=${apiKey}`;
    const res = await fetch(url);

    if (!res.ok) {
      return NextResponse.json(
        { error: `EDINET API error: ${res.status} ${res.statusText}` },
        { status: res.status },
      );
    }

    const contentType = res.headers.get('content-type') || '';

    // JSON レスポンス（エラー）の場合
    if (contentType.includes('application/json')) {
      const data = await res.json();
      return NextResponse.json(
        { error: data.message || 'EDINET document not found' },
        { status: 404 },
      );
    }

    // バイナリ（PDF / ZIP）の場合はそのままストリーム
    const blob = await res.blob();
    const headers: Record<string, string> = {
      'Content-Type': docType === '2' ? 'application/pdf' : 'application/octet-stream',
      'Cache-Control': 'public, max-age=86400',
    };

    if (docType === '2') {
      headers['Content-Disposition'] = `inline; filename="${docId}.pdf"`;
    }

    return new NextResponse(blob, { headers });
  } catch (e) {
    console.error('EDINET doc proxy error:', e);
    return NextResponse.json(
      { error: 'ドキュメント取得に失敗しました' },
      { status: 502 },
    );
  }
}
