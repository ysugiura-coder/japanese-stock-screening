'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Stock, ScreeningCriteria, StocksResponse } from '@/lib/types/stock';
import { screenStocks } from '@/lib/utils/screening';
import {
  fetchEarningsOverlay,
  growthValue,
  EarningsGrowth,
  GrowthMetricKey,
} from '@/lib/utils/earningsOverlay';
import { ScreeningForm } from './components/ScreeningForm';
import { StockTable } from './components/StockTable';
import { UpdateSettings } from './components/UpdateSettings';
import { FavoritesPanel } from './components/FavoritesPanel';
import { StockCountInfo } from './components/StockCountInfo';

// 決算成長率オーバーレイの指標選択肢
const GROWTH_METRIC_OPTIONS: { value: GrowthMetricKey; label: string }[] = [
  { value: 'operatingProfitQQ', label: '営業利益 QQ' },
  { value: 'netProfitQQ', label: '純利益 QQ' },
  { value: 'ordinaryProfitQQ', label: '経常利益 QQ' },
  { value: 'salesQQ', label: '売上 QQ' },
  { value: 'operatingProfitYY', label: '営業利益 YY' },
  { value: 'netProfitYY', label: '純利益 YY' },
  { value: 'ordinaryProfitYY', label: '経常利益 YY' },
  { value: 'salesYY', label: '売上 YY' },
];

/** 今日 / N日前 を YYYY-MM-DD（ローカル）で返す */
function ymdOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function fetchStocks(): Promise<StocksResponse> {
  let email = '';
  let password = '';
  let apiKey = '';
  let apiBase = 'https://api.jquants.com/v1';
  const authMethod = typeof window !== 'undefined' ? localStorage.getItem('jquants_auth_method') || 'email' : 'email';

  if (typeof window !== 'undefined') {
    email = localStorage.getItem('jquants_email') || '';
    password = localStorage.getItem('jquants_password') || '';
    apiKey = localStorage.getItem('jquants_api_key') || '';
    apiBase = localStorage.getItem('jquants_api_base') || 'https://api.jquants.com/v1';
  }

  const headers: HeadersInit = {};
  if (email && password) {
    headers['x-jquants-email'] = email;
    headers['x-jquants-password'] = password;
    headers['x-api-base'] = apiBase;
  } else if (apiKey) {
    headers['x-jquants-api-key'] = apiKey;
    headers['x-api-base'] = apiBase;
  }

  const response = await fetch('/api/stocks', { headers });
  if (!response.ok) {
    throw new Error('Failed to fetch stocks');
  }
  return response.json();
}

async function updateStocks(): Promise<void> {
  let email = '';
  let password = '';
  let apiKey = '';
  let apiBase = 'https://api.jquants.com/v1';
  const authMethod = typeof window !== 'undefined' ? localStorage.getItem('jquants_auth_method') || 'email' : 'email';

  if (typeof window !== 'undefined') {
    email = localStorage.getItem('jquants_email') || '';
    password = localStorage.getItem('jquants_password') || '';
    apiKey = localStorage.getItem('jquants_api_key') || '';
    apiBase = localStorage.getItem('jquants_api_base') || 'https://api.jquants.com/v1';
  }

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  if (authMethod === 'email' && email && password) {
    headers['x-jquants-email'] = email;
    headers['x-jquants-password'] = password;
    headers['x-api-base'] = apiBase;
  } else if (authMethod === 'apikey' && apiKey) {
    headers['x-jquants-api-key'] = apiKey;
    headers['x-api-base'] = apiBase;
  }

  const response = await fetch('/api/update', {
    method: 'POST',
    headers,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || 'Failed to update stocks');
  }
}

export default function Home() {
  const [criteria, setCriteria] = useState<ScreeningCriteria>({ listedOnly: true });
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery<StocksResponse>({
    queryKey: ['stocks'],
    queryFn: fetchStocks,
    staleTime: 60 * 1000,
  });

  const updateMutation = useMutation({
    mutationFn: updateStocks,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stocks'] });
    },
  });

  const [filteredStocks, setFilteredStocks] = useState<Stock[]>([]);

  useEffect(() => {
    if (data?.stocks) {
      const hasCriteria =
        (criteria.codes && criteria.codes.length > 0) ||
        criteria.favoritesOnly === true ||
        criteria.listedOnly === true ||
        (criteria.exchanges && criteria.exchanges.length > 0) ||
        (criteria.per && (criteria.per.min !== undefined || criteria.per.max !== undefined)) ||
        (criteria.pbr && (criteria.pbr.min !== undefined || criteria.pbr.max !== undefined)) ||
        (criteria.roe && (criteria.roe.min !== undefined || criteria.roe.max !== undefined)) ||
        (criteria.dividendYield && (criteria.dividendYield.min !== undefined || criteria.dividendYield.max !== undefined)) ||
        (criteria.marketCap && (criteria.marketCap.min !== undefined || criteria.marketCap.max !== undefined)) ||
        (criteria.volume && (criteria.volume.min !== undefined || criteria.volume.max !== undefined)) ||
        (criteria.price && (criteria.price.min !== undefined || criteria.price.max !== undefined));

      if (!hasCriteria) {
        setFilteredStocks(data.stocks);
      } else {
        const filtered = screenStocks(data.stocks, criteria);
        setFilteredStocks(filtered);
      }
    }
  }, [data, criteria]);

  // ===== 決算成長率オーバーレイ（メイン画面に QQ/YY を重ねる） =====
  const [overlayEnabled, setOverlayEnabled] = useState(false);
  const [overlay, setOverlay] = useState<Map<string, EarningsGrowth> | null>(null);
  const [overlayLoading, setOverlayLoading] = useState(false);
  const [overlayProgress, setOverlayProgress] = useState<{ done: number; total: number } | null>(null);
  const [overlayFrom, setOverlayFrom] = useState(() => ymdOffset(-30));
  const [overlayTo, setOverlayTo] = useState(() => ymdOffset(0));
  // 成長率しきい値フィルタ
  const [growthMetric, setGrowthMetric] = useState<GrowthMetricKey>('operatingProfitQQ');
  const [growthMin, setGrowthMin] = useState('');
  const overlayAbortRef = useRef<AbortController | null>(null);

  const loadOverlay = useCallback(async () => {
    overlayAbortRef.current?.abort();
    const controller = new AbortController();
    overlayAbortRef.current = controller;
    setOverlayLoading(true);
    setOverlayProgress({ done: 0, total: 0 });
    try {
      const map = await fetchEarningsOverlay(overlayFrom, overlayTo, {
        signal: controller.signal,
        onProgress: (done, total) => setOverlayProgress({ done, total }),
      });
      if (!controller.signal.aborted) setOverlay(map);
    } catch {
      // 取得失敗時は overlay を据え置き（部分結果を握りつぶさない）
    } finally {
      if (!controller.signal.aborted) {
        setOverlayLoading(false);
        setOverlayProgress(null);
      }
    }
  }, [overlayFrom, overlayTo]);

  // トグル ON かつ未取得なら自動ロード。OFF で中断。
  useEffect(() => {
    if (overlayEnabled) {
      if (!overlay && !overlayLoading) loadOverlay();
    } else {
      overlayAbortRef.current?.abort();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlayEnabled]);

  // 成長率しきい値でさらに絞り込んだ最終表示リスト
  const displayStocks = useMemo(() => {
    if (!overlayEnabled || !overlay || growthMin === '') return filteredStocks;
    const lo = parseFloat(growthMin);
    if (!Number.isFinite(lo)) return filteredStocks;
    return filteredStocks.filter((s) => {
      const v = growthValue(overlay.get(s.code), growthMetric);
      return v !== null && v >= lo;
    });
  }, [filteredStocks, overlayEnabled, overlay, growthMin, growthMetric]);

  const handleSearch = (newCriteria: ScreeningCriteria) => {
    setCriteria(newCriteria);
  };

  const handleReset = () => {
    setCriteria({ listedOnly: true });
  };

  const handleUpdate = useCallback(async () => {
    try {
      await updateMutation.mutateAsync();
    } catch (error) {
      console.error('Update failed:', error);
    }
  }, [updateMutation]);

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-4xl mx-auto mt-8">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
            <div className="text-4xl mb-3">⚠️</div>
            <p className="font-bold text-red-700 mb-1">データの取得に失敗しました</p>
            <p className="text-red-600 text-sm mb-4">{error instanceof Error ? error.message : 'Unknown error'}</p>
            <button
              onClick={() => queryClient.refetchQueries({ queryKey: ['stocks'] })}
              className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              再試行
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-7xl mx-auto px-4 py-4 md:py-6 space-y-4 md:space-y-6">
        {data && <StockCountInfo data={data} />}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
          <div className="lg:col-span-2 space-y-4 md:space-y-6">
            <ScreeningForm onSearch={handleSearch} onReset={handleReset} />

            {/* 決算成長率オーバーレイ（割安×増益のような複合スクリーニング） */}
            <div className="bg-white rounded-lg shadow-md p-3 md:p-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={overlayEnabled}
                    onChange={(e) => setOverlayEnabled(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <span className="text-sm font-medium">📊 決算成長率を重ねる（QQ/YY）</span>
                </label>
                {overlayEnabled && (
                  <>
                    <div className="flex items-center gap-1 text-xs text-gray-600">
                      <input
                        type="date"
                        value={overlayFrom}
                        onChange={(e) => setOverlayFrom(e.target.value)}
                        className="px-1.5 py-1 border border-gray-300 rounded"
                      />
                      <span>〜</span>
                      <input
                        type="date"
                        value={overlayTo}
                        onChange={(e) => setOverlayTo(e.target.value)}
                        className="px-1.5 py-1 border border-gray-300 rounded"
                      />
                      <button
                        onClick={loadOverlay}
                        disabled={overlayLoading}
                        className="ml-1 px-2 py-1 bg-blue-600 text-white rounded disabled:opacity-50 hover:bg-blue-700"
                      >
                        {overlayLoading ? '取得中…' : '再取得'}
                      </button>
                    </div>
                    {/* 成長率しきい値で絞り込み */}
                    <div className="flex items-center gap-1 text-xs text-gray-600">
                      <select
                        value={growthMetric}
                        onChange={(e) => setGrowthMetric(e.target.value as GrowthMetricKey)}
                        className="px-1.5 py-1 border border-gray-300 rounded"
                      >
                        {GROWTH_METRIC_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                      <span>≥</span>
                      <input
                        type="number"
                        placeholder="%"
                        value={growthMin}
                        onChange={(e) => setGrowthMin(e.target.value)}
                        className="w-16 px-1.5 py-1 border border-gray-300 rounded"
                      />
                      <span>%</span>
                      {growthMin !== '' && (
                        <button onClick={() => setGrowthMin('')} className="ml-1 text-gray-400 hover:text-gray-700">
                          ✕
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
              {overlayEnabled && (
                <p className="text-xs text-gray-500 mt-2">
                  {overlayLoading && overlayProgress
                    ? `決算データ取得中… ${overlayProgress.done}/${overlayProgress.total}営業日`
                    : overlay
                      ? `${overlayFrom}〜${overlayTo} の最新決算を ${overlay.size} 銘柄に反映。期間内に決算が無い銘柄は「—」表示。`
                      : '期間内の各営業日の決算短信を取得して成長率を重ねます。'}
                </p>
              )}
            </div>

            {isLoading ? (
              <div className="bg-white p-8 rounded-lg shadow-md text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-3"></div>
                <p className="text-gray-500">データを読み込み中...</p>
              </div>
            ) : (
              <StockTable stocks={displayStocks} growthOverlay={overlayEnabled ? overlay ?? undefined : undefined} />
            )}
          </div>

          <div className="space-y-4 md:space-y-6">
            <UpdateSettings
              onUpdate={handleUpdate}
              lastUpdate={data?.updatedAt}
              isLoading={updateMutation.isPending}
            />
            {data && <FavoritesPanel allStocks={data.stocks} />}
          </div>
        </div>
      </main>
    </div>
  );
}
