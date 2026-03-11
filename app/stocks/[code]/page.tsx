'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { StocksResponse } from '@/lib/types/stock';
import { formatCurrency, formatMarketCap, formatVolume, formatPercent, formatNumber } from '@/lib/utils/format';
import { isFavorite, addFavorite, removeFavorite } from '@/lib/utils/favorites';
import { Button } from '@/app/components/ui/button';
import { Tooltip } from '@/app/components/Tooltip';
import { useState, useEffect } from 'react';

async function fetchStocks(): Promise<StocksResponse> {
  const headers: HeadersInit = {};
  if (typeof window !== 'undefined') {
    const email = localStorage.getItem('jquants_email') || '';
    const password = localStorage.getItem('jquants_password') || '';
    const apiKey = localStorage.getItem('jquants_api_key') || '';
    const apiBase = localStorage.getItem('jquants_api_base') || 'https://api.jquants.com/v1';

    if (email && password) {
      headers['x-jquants-email'] = email;
      headers['x-jquants-password'] = password;
      headers['x-api-base'] = apiBase;
    } else if (apiKey) {
      headers['x-jquants-api-key'] = apiKey;
      headers['x-api-base'] = apiBase;
    }
  }

  const response = await fetch('/api/stocks', { headers });
  if (!response.ok) {
    throw new Error('Failed to fetch stocks');
  }
  return response.json();
}

export default function StockDetailPage() {
  const params = useParams();
  const router = useRouter();
  const code = params.code as string;
  const [isFav, setIsFav] = useState(false);

  const { data, isLoading } = useQuery<StocksResponse>({
    queryKey: ['stocks'],
    queryFn: fetchStocks,
  });

  const stock = data?.stocks.find((s) => s.code === code);

  useEffect(() => {
    setIsFav(isFavorite(code));
  }, [code]);

  const toggleFavorite = () => {
    if (isFav) {
      removeFavorite(code);
    } else {
      addFavorite(code);
    }
    setIsFav(!isFav);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-3"></div>
          <p className="text-gray-500">読み込み中...</p>
        </div>
      </div>
    );
  }

  if (!stock) {
    return (
      <div className="min-h-screen bg-gray-100">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="bg-white rounded-lg shadow-md p-8 text-center">
            <div className="text-4xl mb-3">🔍</div>
            <p className="text-gray-500 mb-4">銘柄コード「{code}」が見つかりませんでした</p>
            <Button onClick={() => router.push('/')}>スクリーニングに戻る</Button>
          </div>
        </div>
      </div>
    );
  }

  const metrics = [
    { label: 'PER', value: formatNumber(stock.per), tooltip: '株価 ÷ EPS。低いほど割安。10〜15倍が目安。', color: stock.per !== null && stock.per < 15 ? 'text-green-600' : '' },
    { label: 'PBR', value: formatNumber(stock.pbr), tooltip: '株価 ÷ BPS。1倍以下は純資産割れで割安。', color: stock.pbr !== null && stock.pbr < 1 ? 'text-green-600' : '' },
    { label: 'ROE', value: formatPercent(stock.roe), tooltip: '純利益 ÷ 自己資本。8%以上が優良。', color: stock.roe !== null && stock.roe > 8 ? 'text-green-600' : '' },
    { label: '配当利回り', value: formatPercent(stock.dividendYield), tooltip: '年間配当 ÷ 株価。3%以上で高配当。', color: stock.dividendYield !== null && stock.dividendYield > 3 ? 'text-green-600' : '' },
  ];

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-4xl mx-auto px-4 py-4 md:py-8">
        {/* ナビゲーション */}
        <Button variant="outline" onClick={() => router.back()} className="mb-4" size="sm">
          ← 戻る
        </Button>

        {/* ヘッダー */}
        <div className="bg-white rounded-lg shadow-md p-4 md:p-6 mb-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-2xl md:text-3xl font-bold text-gray-900">{stock.name}</h1>
                <button
                  onClick={toggleFavorite}
                  className={`text-2xl transition-colors ${isFav ? 'text-yellow-400' : 'text-gray-300 hover:text-yellow-300'}`}
                  title={isFav ? 'お気に入りから削除' : 'お気に入りに追加'}
                >
                  ★
                </button>
              </div>
              <div className="flex items-center gap-3 text-sm text-gray-500">
                <span className="font-mono font-medium">{stock.code}</span>
                <span className="bg-gray-100 px-2 py-0.5 rounded text-xs">{stock.market}</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl md:text-3xl font-bold">{formatCurrency(stock.price)}</div>
              <div className="text-xs text-gray-400 mt-1">
                {new Date(stock.updatedAt).toLocaleString('ja-JP')}
              </div>
            </div>
          </div>
        </div>

        {/* 財務指標カード */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          {metrics.map((m) => (
            <div key={m.label} className="bg-white rounded-lg shadow-md p-4 text-center">
              <div className="text-xs text-gray-500 mb-1">
                <Tooltip text={m.tooltip}>{m.label}</Tooltip>
              </div>
              <div className={`text-xl md:text-2xl font-bold ${m.color}`}>
                {m.value}
              </div>
            </div>
          ))}
        </div>

        {/* 詳細情報 */}
        <div className="bg-white rounded-lg shadow-md p-4 md:p-6 mb-4">
          <h2 className="text-lg font-semibold mb-4">基本情報</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
            {[
              { label: '時価総額', value: formatMarketCap(stock.marketCap) },
              { label: '出来高', value: formatVolume(stock.volume) },
              { label: '市場', value: stock.market },
              { label: '最終更新', value: new Date(stock.updatedAt).toLocaleString('ja-JP') },
            ].map((item) => (
              <div key={item.label} className="flex justify-between py-2 border-b border-gray-100">
                <dt className="text-gray-500 text-sm">{item.label}</dt>
                <dd className="font-medium text-sm">{item.value}</dd>
              </div>
            ))}
          </div>
        </div>

        {/* 外部リンク */}
        <div className="bg-white rounded-lg shadow-md p-4 md:p-6">
          <h2 className="text-lg font-semibold mb-3">外部サイトで詳細を確認</h2>
          <div className="flex flex-wrap gap-2">
            {[
              { label: '株探', url: `https://kabutan.jp/stock/?code=${stock.code}` },
              { label: 'IR BANK', url: `https://irbank.net/${stock.code}` },
              { label: 'Yahoo!ファイナンス', url: `https://finance.yahoo.co.jp/quote/${stock.code}.T` },
              { label: 'バフェット・コード', url: `https://www.buffett-code.com/company/${stock.code}` },
            ].map((link) => (
              <a
                key={link.label}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-3 py-2 text-sm bg-gray-50 hover:bg-gray-100 border rounded-md transition-colors"
              >
                {link.label}
                <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
