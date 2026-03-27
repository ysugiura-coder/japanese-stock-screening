'use client';

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { EarningsData } from '@/lib/types/financial';
import { mockEarningsData } from '@/lib/data/mock-earnings';
import { formatPercent } from '@/lib/utils/format';

type SortConfig = { key: string; direction: 'asc' | 'desc' } | null;
type DataSource = 'auto' | 'edinet' | 'mock';

const EDINET_API_KEY_STORAGE = 'edinet_api_key';

/** YYYY-MM-DD 文字列を安全に1日進める / 戻す（タイムゾーン非依存） */
function shiftDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  // UTCで日付を作ることでタイムゾーンずれを回避
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (days > 0) {
    dt.setUTCDate(dt.getUTCDate() + days);
  } else {
    dt.setUTCDate(dt.getUTCDate() + days);
  }
  const ny = dt.getUTCFullYear();
  const nm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const nd = String(dt.getUTCDate()).padStart(2, '0');
  return `${ny}-${nm}-${nd}`;
}

/** 今日の日付を YYYY-MM-DD で取得（ローカルタイム） */
function getTodayStr(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export default function EarningsPage() {
  const [dataSource, setDataSource] = useState<DataSource>('auto');
  const [edinetApiKey, setEdinetApiKey] = useState('');
  const [earningsData, setEarningsData] = useState<EarningsData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSource, setActiveSource] = useState<string>('mock');
  const [warning, setWarning] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(getTodayStr);
  const [selectedCompany, setSelectedCompany] = useState<EarningsData | null>(null);
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);
  const [filters, setFilters] = useState({
    決算短信: true,
    業績修正: true,
    配当修正: false,
    決算資料: false,
    その他: false,
  });

  // クライアント側キャッシュ: 日付→データ をメモリに保持（1週間分）
  const clientCache = useRef<Map<string, { earnings: EarningsData[]; source: string; fetchedAt: number }>>(new Map());
  const prefetchingRef = useRef(false);
  const lastTodayRef = useRef(getTodayStr());

  // localStorage からAPIキーを読み込み
  useEffect(() => {
    try {
      const savedKey = localStorage.getItem(EDINET_API_KEY_STORAGE) || '';
      setEdinetApiKey(savedKey);
    } catch {
      // localStorage使用不可
    }
  }, []);

  // API呼び出し（キャッシュ書き込み含む）
  const fetchFromApi = useCallback(async (date: string, source: DataSource, apiKey: string, forceRefresh = false): Promise<{ earnings: EarningsData[]; source: string; warning?: string }> => {
    // モックデータを使う場合
    const useMock = source === 'mock' || (!apiKey && source !== 'edinet');
    if (useMock) {
      const mockData = mockEarningsData
        .filter((d) => d.date === date)
        .map((d) => ({ ...d, dataSource: 'mock' as const }));
      return { earnings: mockData, source: 'mock', warning: !apiKey && source !== 'mock' ? 'EDINET APIキーが設定されていません。設定ページで登録してください。' : undefined };
    }

    // API から取得
    const headers: Record<string, string> = {};
    if (apiKey) headers['x-edinet-api-key'] = apiKey;

    const params = new URLSearchParams({ date, source, parseFinancials: 'true' });
    if (forceRefresh) params.set('clearCache', 'true');
    const res = await fetch(`/api/earnings?${params}`, { headers });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || `API error: ${res.status}`);
    return { earnings: data.earnings || [], source: data.source || 'unknown', warning: data.warning };
  }, []);

  // データ取得（クライアントキャッシュ優先）
  const fetchEarnings = useCallback(async (date: string, source: DataSource, apiKey: string, forceRefresh = false) => {
    // クライアントキャッシュにあればそれを使う（強制リフレッシュ時は除く）
    if (!forceRefresh) {
      const cached = clientCache.current.get(`${date}:${source}`);
      if (cached) {
        // 当日データは1時間でキャッシュ失効、過去日付は7日間有効
        const today = getTodayStr();
        const maxAge = date < today ? 7 * 24 * 60 * 60 * 1000 : 60 * 60 * 1000;
        if (Date.now() - cached.fetchedAt < maxAge) {
          setEarningsData(cached.earnings);
          setActiveSource(cached.source);
          setError(null);
          setWarning(null);
          setSelectedCompany(null);
          return;
        }
      }
    }

    setLoading(true);
    setError(null);
    setWarning(null);
    setSelectedCompany(null);

    try {
      const result = await fetchFromApi(date, source, apiKey, forceRefresh);
      // クライアントキャッシュに保存
      clientCache.current.set(`${date}:${source}`, {
        earnings: result.earnings,
        source: result.source,
        fetchedAt: Date.now(),
      });
      setEarningsData(result.earnings);
      setActiveSource(result.source);
      if (result.warning) setWarning(result.warning);
    } catch (err) {
      console.error('Earnings fetch error:', err);
      setError(err instanceof Error ? err.message : String(err));
      const mockData = mockEarningsData
        .filter((d) => d.date === date)
        .map((d) => ({ ...d, dataSource: 'mock' as const }));
      setEarningsData(mockData);
      setActiveSource('mock');
    } finally {
      setLoading(false);
    }
  }, [fetchFromApi]);

  // 1週間分をバックグラウンドでプリフェッチ
  const prefetchWeek = useCallback(async (source: DataSource, apiKey: string) => {
    if (prefetchingRef.current) return;
    prefetchingRef.current = true;

    const today = getTodayStr();
    const dates: string[] = [];
    for (let i = 0; i < 7; i++) {
      dates.push(shiftDate(today, -i));
    }

    // 並列で全日付を取得（キャッシュ済みはスキップ）
    await Promise.allSettled(
      dates.map(async (date) => {
        const cacheKey = `${date}:${source}`;
        const cached = clientCache.current.get(cacheKey);
        const maxAge = date < today ? 7 * 24 * 60 * 60 * 1000 : 60 * 60 * 1000;
        if (cached && Date.now() - cached.fetchedAt < maxAge) return; // 既にキャッシュ済み

        try {
          const result = await fetchFromApi(date, source, apiKey);
          clientCache.current.set(cacheKey, {
            earnings: result.earnings,
            source: result.source,
            fetchedAt: Date.now(),
          });
        } catch {
          // プリフェッチ失敗は無視
        }
      }),
    );

    prefetchingRef.current = false;
  }, [fetchFromApi]);

  // 日付・ソース・APIキー変更時にデータ取得
  useEffect(() => {
    fetchEarnings(selectedDate, dataSource, edinetApiKey);
  }, [selectedDate, dataSource, edinetApiKey, fetchEarnings]);

  // 初回マウント時に1週間分プリフェッチ
  useEffect(() => {
    if (edinetApiKey || dataSource === 'mock') {
      prefetchWeek(dataSource, edinetApiKey);
    }
  }, [edinetApiKey, dataSource, prefetchWeek]);

  // 日付変更検知（0時を跨いだら当日分を強制リフレッシュ）
  useEffect(() => {
    const checkDateChange = () => {
      const now = getTodayStr();
      if (now !== lastTodayRef.current) {
        lastTodayRef.current = now;
        // 当日のキャッシュをクリア
        for (const key of clientCache.current.keys()) {
          if (key.startsWith(now + ':')) {
            clientCache.current.delete(key);
          }
        }
        // 表示中の日付が昨日の「今日」なら自動で今日に切り替え
        setSelectedDate((prev) => {
          if (prev === shiftDate(now, -1)) return now;
          return prev;
        });
        // 1週間分を再プリフェッチ
        prefetchWeek(dataSource, edinetApiKey);
      }
    };

    // 30秒ごとに日付変更をチェック
    const interval = setInterval(checkDateChange, 30000);
    return () => clearInterval(interval);
  }, [dataSource, edinetApiKey, prefetchWeek]);

  // =========== 日付操作 ===========
  const goToPrevDate = useCallback(() => {
    setSelectedDate((prev) => shiftDate(prev, -1));
  }, []);

  const goToNextDate = useCallback(() => {
    setSelectedDate((prev) => shiftDate(prev, 1));
  }, []);

  const goToToday = useCallback(() => {
    setSelectedDate(getTodayStr());
  }, []);

  // =========== フィルタ & ソート ===========
  const filteredData = useMemo(() => {
    return earningsData.filter((item) => {
      if (item.type === '決算') return filters.決算短信;
      if (item.type === '業績修正') return filters.業績修正;
      if (item.type === '配当修正') return filters.配当修正;
      if (item.type === '決算資料') return filters.決算資料;
      return filters.その他;
    });
  }, [earningsData, filters]);

  const sortedData = useMemo(() => {
    if (!sortConfig) return filteredData;
    return [...filteredData].sort((a, b) => {
      const aVal = a[sortConfig.key as keyof EarningsData] as number | null;
      const bVal = b[sortConfig.key as keyof EarningsData] as number | null;
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;
      return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
    });
  }, [filteredData, sortConfig]);

  const handleSort = (key: string) => {
    setSortConfig((prev) =>
      prev?.key === key
        ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'desc' }
    );
  };

  const sortIcon = (key: string) => {
    if (sortConfig?.key !== key) return '';
    return sortConfig.direction === 'asc' ? ' ▲' : ' ▼';
  };

  // =========== 表示ヘルパー ===========
  const getTypeBadge = (type: string, salesYY?: number | null) => {
    switch (type) {
      case '決算':
        return <span className="inline-block px-1.5 py-0.5 rounded text-xs font-medium bg-gray-600 text-white whitespace-nowrap">決算</span>;
      case '業績修正':
        return (
          <span className="inline-block px-1.5 py-0.5 rounded text-xs font-medium whitespace-nowrap bg-yellow-500/20 text-yellow-400">
            修正{salesYY && salesYY > 0 ? '↑' : '↓'}
          </span>
        );
      case '配当修正':
        return <span className="inline-block px-1.5 py-0.5 rounded text-xs font-medium bg-blue-500/20 text-blue-400 whitespace-nowrap">配当</span>;
      case '決算資料':
        return <span className="inline-block px-1.5 py-0.5 rounded text-xs font-medium bg-purple-500/20 text-purple-400 whitespace-nowrap">資料</span>;
      default:
        return <span className="inline-block px-1.5 py-0.5 rounded text-xs font-medium bg-gray-500/20 text-gray-400 whitespace-nowrap">他</span>;
    }
  };

  const formatDateShort = (dateStr: string) => {
    const [, m, d] = dateStr.split('-');
    return `${m}/${d}`;
  };

  const getSourceBadge = (source?: string) => {
    if (source === 'edinet') return <span className="inline-block px-1.5 py-0.5 rounded text-xs font-medium bg-green-500/20 text-green-400">EDINET</span>;
    if (source === 'mock') return <span className="inline-block px-1.5 py-0.5 rounded text-xs font-medium bg-gray-500/20 text-gray-400">MOCK</span>;
    return null;
  };

  // EDINET PDF閲覧リンク（APIプロキシ経由 or EDINET検索ページ）
  const openEdinetDoc = (docId?: string) => {
    if (!docId) return;
    if (edinetApiKey) {
      // APIキーがあればプロキシ経由でPDFを新タブで表示
      const url = `/api/edinet-doc/${docId}?type=2`;
      const w = window.open('about:blank', '_blank');
      if (w) {
        fetch(url, { headers: { 'x-edinet-api-key': edinetApiKey } })
          .then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.blob();
          })
          .then((blob) => {
            w.location.href = URL.createObjectURL(blob);
          })
          .catch(() => {
            // フォールバック: EDINET検索ページ
            w.location.href = 'https://disclosure2.edinet-fsa.go.jp/WEEK0010.aspx';
          });
      }
    } else {
      // APIキーなしの場合はEDINET検索ページへ
      window.open('https://disclosure2.edinet-fsa.go.jp/WEEK0010.aspx', '_blank');
    }
  };

  const sortableThClass = 'px-3 py-2 text-left text-xs font-medium uppercase cursor-pointer hover:bg-gray-600 select-none';

  const numericColumns: { key: string; label: string }[] = [
    { key: 'salesQQ', label: '売QQ' },
    { key: 'operatingProfitQQ', label: '営QQ' },
    { key: 'ordinaryProfitQQ', label: '経QQ' },
    { key: 'netProfitQQ', label: '利QQ' },
    { key: 'salesYY', label: '売YY' },
    { key: 'operatingProfitYY', label: '営YY' },
    { key: 'ordinaryProfitYY', label: '経YY' },
    { key: 'netProfitYY', label: '利YY' },
    { key: 'salesCon', label: '売Con' },
    { key: 'operatingProfitCon', label: '営Con' },
    { key: 'ordinaryProfitCon', label: '経Con' },
    { key: 'netProfitCon', label: '利Con' },
  ];

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* ヘッダー */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">決算分析リアルタイムビューア</h1>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={goToPrevDate} className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm">
                ◀ 前日
              </button>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => {
                  if (e.target.value) setSelectedDate(e.target.value);
                }}
                className="px-3 py-1 bg-gray-700 border border-gray-600 rounded text-sm text-white [color-scheme:dark]"
              />
              <button type="button" onClick={goToNextDate} className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm">
                翌日 ▶
              </button>
              <button type="button" onClick={goToToday} className="px-3 py-1 bg-blue-600 hover:bg-blue-500 rounded text-sm">
                今日
              </button>
              <button
                type="button"
                onClick={() => fetchEarnings(selectedDate, dataSource, edinetApiKey, true)}
                disabled={loading}
                className="px-3 py-1 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 rounded text-sm"
              >
                {loading ? '取得中...' : '更新'}
              </button>
            </div>
          </div>

          {/* データソース切替 & フィルター */}
          <div className="flex flex-wrap items-center gap-4 mb-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-400">ソース:</span>
              <select
                value={dataSource}
                onChange={(e) => setDataSource(e.target.value as DataSource)}
                className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm text-white"
              >
                <option value="auto">自動（EDINET優先）</option>
                <option value="edinet">EDINET</option>
                <option value="mock">モックデータ</option>
              </select>
            </div>
            <div className="h-4 w-px bg-gray-600" />
            <span className="text-sm text-gray-400">フィルター:</span>
            {Object.entries(filters).map(([key, value]) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={value}
                  onChange={(e) => setFilters({ ...filters, [key]: e.target.checked })}
                  className="w-4 h-4"
                />
                <span className="text-sm">{key}</span>
              </label>
            ))}
            <span className="text-xs text-gray-400 ml-auto">
              ({filteredData.length}件表示 / {earningsData.length}件取得)
            </span>
          </div>

          {/* 警告・エラー */}
          {warning && (
            <div className="bg-yellow-900/30 border border-yellow-600/50 rounded-lg px-4 py-2 mb-4 text-sm text-yellow-300">
              {warning}
            </div>
          )}
          {error && (
            <div className="bg-red-900/30 border border-red-600/50 rounded-lg px-4 py-2 mb-4 text-sm text-red-300">
              {error}
            </div>
          )}

          {/* APIキー未設定 案内 */}
          {!edinetApiKey && dataSource !== 'mock' && (
            <div className="bg-blue-900/30 border border-blue-600/50 rounded-lg px-4 py-3 mb-4">
              <p className="text-sm text-blue-300 mb-1">
                EDINET APIキーを設定すると、有価証券報告書・四半期報告書・決算短信の実データを表示できます。
              </p>
              <p className="text-xs text-blue-400">
                <a href="/settings" className="underline hover:text-blue-200">設定ページ</a>でEDINET APIキーを登録してください（無料）。
                現在はモックデータを表示しています。
              </p>
            </div>
          )}
        </div>

        {/* メインテーブル */}
        <div className="bg-gray-800 rounded-lg overflow-hidden mb-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400" />
              <span className="ml-3 text-gray-400">データを取得中...</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-700">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase">日付</th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase">時刻</th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase">コード / 企業名</th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase">種別</th>
                    {numericColumns.map((col) => (
                      <th key={col.key} onClick={() => handleSort(col.key)} className={sortableThClass}>
                        {col.label}{sortIcon(col.key)}
                      </th>
                    ))}
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase">情報</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {sortedData.length === 0 ? (
                    <tr>
                      <td colSpan={17} className="px-3 py-8 text-center text-gray-400">
                        {earningsData.length === 0 ? 'この日付のデータはありません' : 'フィルター条件に一致するデータがありません'}
                      </td>
                    </tr>
                  ) : (
                    sortedData.map((data, index) => (
                      <tr
                        key={`${data.code}-${data.date}-${index}`}
                        onClick={() => setSelectedCompany(data)}
                        className={`hover:bg-gray-700/50 cursor-pointer ${
                          selectedCompany?.code === data.code && selectedCompany?.date === data.date ? 'bg-blue-900/30' : ''
                        }`}
                      >
                        <td className="px-3 py-2 text-gray-400">{formatDateShort(data.date)}</td>
                        <td className="px-3 py-2">{data.time}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span className="text-gray-400">{data.code}</span>{' '}
                          <span>{data.companyName}</span>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1">
                            {getTypeBadge(data.type, data.salesYY)}
                            {getSourceBadge(data.dataSource)}
                          </div>
                        </td>
                        {numericColumns.map((col) => {
                          const val = data[col.key as keyof EarningsData] as number | null;
                          return (
                            <td key={col.key} className="px-3 py-2">
                              {val !== null && val !== undefined ? (
                                <span className={val >= 0 ? 'text-green-400' : 'text-red-400'}>
                                  {formatPercent(val)}
                                </span>
                              ) : '-'}
                            </td>
                          );
                        })}
                        <td className="px-3 py-2 text-xs">
                          <div className="flex items-center gap-2">
                            {data.dividend !== null && data.dividend !== undefined && (
                              <span>
                                合計{data.dividend.toFixed(2)}円
                                {data.dividendChange !== null && data.dividendChange !== undefined && ` 前期比${formatPercent(data.dividendChange)}`}
                              </span>
                            )}
                            {data.edinetDocId && (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); openEdinetDoc(data.edinetDocId); }}
                                className="text-blue-400 hover:text-blue-300 underline"
                              >
                                EDINET
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 詳細パネル */}
        {selectedCompany && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-gray-800 rounded-lg p-6">
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-xl font-bold">
                  [{selectedCompany.type}] {selectedCompany.code} {selectedCompany.companyName}
                </h2>
                {getSourceBadge(selectedCompany.dataSource)}
              </div>
              <div className="space-y-4">
                {selectedCompany.edinetDocDescription && (
                  <div className="bg-gray-700/50 rounded p-3 text-sm">
                    <span className="text-gray-400">書類: </span>
                    <span>{selectedCompany.edinetDocDescription}</span>
                    {selectedCompany.edinetDocId && (
                      <button type="button" onClick={() => openEdinetDoc(selectedCompany.edinetDocId)} className="ml-2 text-blue-400 hover:text-blue-300 underline">
                        EDINETで確認
                      </button>
                    )}
                  </div>
                )}
                <div>
                  <h3 className="font-semibold mb-2">【業績（YoY / QoQ）】</h3>
                  <div className="space-y-2 text-sm">
                    {[
                      { label: '売上高', yy: selectedCompany.salesYY, qq: selectedCompany.salesQQ },
                      { label: '営業利益', yy: selectedCompany.operatingProfitYY, qq: selectedCompany.operatingProfitQQ },
                      { label: '経常利益', yy: selectedCompany.ordinaryProfitYY, qq: selectedCompany.ordinaryProfitQQ },
                      { label: '純利益', yy: selectedCompany.netProfitYY, qq: selectedCompany.netProfitQQ },
                    ].map((row) => (
                      <div key={row.label} className="flex justify-between">
                        <span>{row.label}:</span>
                        <span>
                          YoY {row.yy !== null ? formatPercent(row.yy) : '-'} / QoQ {row.qq !== null ? formatPercent(row.qq) : '-'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="font-semibold mb-2">【配当】</h3>
                  <div className="text-sm">
                    {selectedCompany.dividend !== null && selectedCompany.dividend !== undefined ? (
                      <span>
                        配当 {selectedCompany.dividend.toFixed(2)}円
                        {selectedCompany.dividendChange !== null && selectedCompany.dividendChange !== undefined && ` / 前期比${formatPercent(selectedCompany.dividendChange)}`}
                      </span>
                    ) : (
                      <span className="text-gray-400">配当情報なし</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-gray-800 rounded-lg p-6">
              {selectedCompany.segments ? (
                <>
                  <h2 className="text-xl font-bold mb-4">セグメント別業績 ({selectedCompany.segments.period})</h2>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-700">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-medium">事業</th>
                          <th className="px-3 py-2 text-right text-xs font-medium">売上(百万)</th>
                          <th className="px-3 py-2 text-right text-xs font-medium">利益(百万)</th>
                          <th className="px-3 py-2 text-right text-xs font-medium">売上YoY</th>
                          <th className="px-3 py-2 text-right text-xs font-medium">利益YoY</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-700">
                        {[...selectedCompany.segments.segments]
                          .sort((a, b) => Math.abs(b.profitYoY ?? 0) - Math.abs(a.profitYoY ?? 0))
                          .map((seg, idx) => {
                            const isHighlight = seg.profitYoY != null && Math.abs(seg.profitYoY) >= 30;
                            return (
                              <tr key={idx} className={isHighlight ? 'bg-yellow-900/20' : ''}>
                                <td className="px-3 py-2">{seg.name}</td>
                                <td className="px-3 py-2 text-right">{(seg.sales / 1000000).toFixed(0)}百万</td>
                                <td className="px-3 py-2 text-right">{(seg.profit / 1000000).toFixed(0)}百万</td>
                                <td className="px-3 py-2 text-right">
                                  {seg.salesYoY != null ? (
                                    <span className={seg.salesYoY >= 0 ? 'text-green-400' : 'text-red-400'}>{formatPercent(seg.salesYoY)}</span>
                                  ) : '-'}
                                </td>
                                <td className="px-3 py-2 text-right">
                                  {seg.profitYoY != null ? (
                                    <span className={`${seg.profitYoY >= 0 ? 'text-green-400' : 'text-red-400'} ${isHighlight ? 'font-bold' : ''}`}>
                                      {formatPercent(seg.profitYoY)}
                                    </span>
                                  ) : '-'}
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <div>
                  <h2 className="text-xl font-bold mb-4">書類情報</h2>
                  <div className="space-y-3 text-sm">
                    {selectedCompany.edinetDocDescription && (
                      <div><span className="text-gray-400">書類種別: </span>{selectedCompany.edinetDocDescription}</div>
                    )}
                    <div><span className="text-gray-400">提出日時: </span>{selectedCompany.date} {selectedCompany.time}</div>
                    {selectedCompany.edinetDocId && (
                      <div className="pt-2">
                        <button type="button" onClick={() => openEdinetDoc(selectedCompany.edinetDocId)} className="inline-block px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm">
                          EDINETで書類を確認
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
