'use client';

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { EarningsData } from '@/lib/types/financial';
import { Stock, StocksResponse } from '@/lib/types/stock';
import { mockEarningsData } from '@/lib/data/mock-earnings';
import { formatPercent, formatMarketCap, convertToCSV } from '@/lib/utils/format';
import { isListedCompany } from '@/lib/utils/screening';
import { getFavorites } from '@/lib/utils/favorites';

type SortConfig = { key: string; direction: 'asc' | 'desc' } | null;
type DataSource = 'auto' | 'edinet' | 'mock';
type QuickFilter =
  | 'all'
  | 'increase'
  | 'decrease'
  | 'upwardRevision'
  | 'downwardRevision'
  | 'beatConsensus'
  | 'dividendUp';

const EDINET_API_KEY_STORAGE = 'edinet_api_key';
const ADV_FILTERS_STORAGE_KEY = 'earnings_adv_filters';

/** /api/stocks から上場銘柄ユニバースを取得（認証ヘッダ付き） */
async function fetchStockUniverse(): Promise<StocksResponse> {
  const headers: HeadersInit = {};
  if (typeof window !== 'undefined') {
    const email = localStorage.getItem('jquants_email') || '';
    const password = localStorage.getItem('jquants_password') || '';
    const apiKey = localStorage.getItem('jquants_api_key') || '';
    const apiBase = localStorage.getItem('jquants_api_base') || '';
    if (email && password) {
      (headers as Record<string, string>)['x-jquants-email'] = email;
      (headers as Record<string, string>)['x-jquants-password'] = password;
    } else if (apiKey) {
      (headers as Record<string, string>)['x-jquants-api-key'] = apiKey;
    }
    if (apiBase) (headers as Record<string, string>)['x-api-base'] = apiBase;
  }
  const res = await fetch('/api/stocks', { headers });
  if (!res.ok) throw new Error('Failed to fetch stock universe');
  return res.json();
}

/** YYYY-MM-DD 文字列を安全に1日進める / 戻す（タイムゾーン非依存） */
function shiftDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  // UTCで日付を作ることでタイムゾーンずれを回避
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
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
  const [dateFrom, setDateFrom] = useState(getTodayStr);
  const [dateTo, setDateTo] = useState(getTodayStr);
  const [selectedCompany, setSelectedCompany] = useState<EarningsData | null>(null);
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const DATE_RANGE_STORAGE_KEY = 'earnings_date_range';
  const FILTERS_STORAGE_KEY = 'earnings_filters';
  const defaultFilters = {
    決算短信: true,
    有報: true,
    有報訂正: true,
    四半期: true,
    四半期訂正: true,
    業績修正: true,
    配当修正: true,
  };
  const [filters, setFilters] = useState(defaultFilters);
  const [filtersLoaded, setFiltersLoaded] = useState(false);

  // ── 投資家目線フィルタ state ──
  const [listedOnly, setListedOnly] = useState(true);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [selectedMarkets, setSelectedMarkets] = useState<Set<string>>(new Set());
  const [marketCapMin, setMarketCapMin] = useState<string>(''); // 億円、空文字で無制限
  const [marketCapMax, setMarketCapMax] = useState<string>('');
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');
  const [showAdvFilters, setShowAdvFilters] = useState(false);
  const [favoritesSet, setFavoritesSet] = useState<Set<string>>(new Set());

  // ── 上場銘柄ユニバース（/api/stocks と共有キャッシュ） ──
  const { data: stocksData } = useQuery<StocksResponse>({
    queryKey: ['stocks'],
    queryFn: fetchStockUniverse,
    staleTime: 5 * 60 * 1000,
  });

  const stockMap = useMemo(() => {
    const m = new Map<string, Stock>();
    if (stocksData?.stocks) {
      for (const s of stocksData.stocks) m.set(s.code, s);
    }
    return m;
  }, [stocksData]);

  // 市場区分の候補一覧
  const availableMarkets = useMemo(() => {
    const set = new Set<string>();
    stockMap.forEach((s) => {
      if (s.market) set.add(s.market);
    });
    return Array.from(set).sort();
  }, [stockMap]);

  // クライアント側キャッシュ: 日付→データ をメモリに保持（1週間分）
  const clientCache = useRef<Map<string, { earnings: EarningsData[]; source: string; fetchedAt: number }>>(new Map());
  const prefetchingRef = useRef(false);
  const lastTodayRef = useRef(getTodayStr());

  // localStorage からAPIキーとフィルター設定を読み込み
  useEffect(() => {
    try {
      const savedKey = localStorage.getItem(EDINET_API_KEY_STORAGE) || '';
      setEdinetApiKey(savedKey);
      const savedFilters = localStorage.getItem(FILTERS_STORAGE_KEY);
      if (savedFilters) {
        setFilters({ ...defaultFilters, ...JSON.parse(savedFilters) });
      }
      const savedRange = localStorage.getItem(DATE_RANGE_STORAGE_KEY);
      if (savedRange) {
        const { from, to } = JSON.parse(savedRange);
        if (from) setDateFrom(from);
        if (to) setDateTo(to);
      }
      const savedAdv = localStorage.getItem(ADV_FILTERS_STORAGE_KEY);
      if (savedAdv) {
        const a = JSON.parse(savedAdv);
        if (typeof a.listedOnly === 'boolean') setListedOnly(a.listedOnly);
        if (typeof a.favoritesOnly === 'boolean') setFavoritesOnly(a.favoritesOnly);
        if (Array.isArray(a.selectedMarkets)) setSelectedMarkets(new Set(a.selectedMarkets));
        if (typeof a.marketCapMin === 'string') setMarketCapMin(a.marketCapMin);
        if (typeof a.marketCapMax === 'string') setMarketCapMax(a.marketCapMax);
        if (typeof a.quickFilter === 'string') setQuickFilter(a.quickFilter);
      }
      // お気に入り銘柄を読み込み
      setFavoritesSet(new Set(getFavorites()));
    } catch {
      // localStorage使用不可
    }
    setFiltersLoaded(true);
  }, []);

  // お気に入り変更を検知（他タブ / 他ページでの変更反映）
  useEffect(() => {
    const handler = () => setFavoritesSet(new Set(getFavorites()));
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
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

  const MAX_RANGE_DAYS = 31;

  // 日付範囲からすべての日付を生成（上限あり）
  const getDatesInRange = useCallback((from: string, to: string): string[] => {
    const dates: string[] = [];
    let current = from;
    let count = 0;
    while (current <= to && count < MAX_RANGE_DAYS) {
      dates.push(current);
      current = shiftDate(current, 1);
      count++;
    }
    return dates;
  }, []);

  // データ取得（範囲対応・クライアントキャッシュ優先）
  const fetchEarningsRange = useCallback(async (from: string, to: string, source: DataSource, apiKey: string, forceRefresh = false) => {
    const dates = getDatesInRange(from, to);
    const today = getTodayStr();

    // 全日付キャッシュ済みかチェック
    if (!forceRefresh) {
      const allCached = dates.every((date) => {
        const cached = clientCache.current.get(`${date}:${source}`);
        if (!cached) return false;
        const maxAge = date < today ? 7 * 24 * 60 * 60 * 1000 : 60 * 60 * 1000;
        return Date.now() - cached.fetchedAt < maxAge;
      });
      if (allCached) {
        const allData = dates.flatMap((date) => clientCache.current.get(`${date}:${source}`)!.earnings);
        setEarningsData(allData);
        setActiveSource(clientCache.current.get(`${dates[0]}:${source}`)?.source || 'unknown');
        setError(null);
        setWarning(null);
        setSelectedCompany(null);
        return;
      }
    }

    setLoading(true);
    setError(null);
    setWarning(null);
    setSelectedCompany(null);

    try {
      // 3並列ずつバッチ処理（EDINET APIの負荷を抑える）
      const results: { earnings: EarningsData[]; source: string; warning?: string }[] = [];
      const BATCH_SIZE = 3;
      for (let i = 0; i < dates.length; i += BATCH_SIZE) {
        const batch = dates.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(
          batch.map(async (date): Promise<{ earnings: EarningsData[]; source: string; warning?: string }> => {
            // 個別キャッシュ確認
            if (!forceRefresh) {
              const cached = clientCache.current.get(`${date}:${source}`);
              if (cached) {
                const maxAge = date < today ? 7 * 24 * 60 * 60 * 1000 : 60 * 60 * 1000;
                if (Date.now() - cached.fetchedAt < maxAge) return { earnings: cached.earnings, source: cached.source };
              }
            }
            const result = await fetchFromApi(date, source, apiKey, forceRefresh);
            clientCache.current.set(`${date}:${source}`, {
              earnings: result.earnings,
              source: result.source,
              fetchedAt: Date.now(),
            });
            return result;
          }),
        );
        results.push(...batchResults);
        // バッチ完了ごとに途中結果を表示
        const allSoFar = results.flatMap((r) => r.earnings);
        setEarningsData(allSoFar);
      }
      const allData = results.flatMap((r) => r.earnings);
      const lastWarning = results.find((r) => r.warning)?.warning;
      setEarningsData(allData);
      setActiveSource(results[0]?.source || 'unknown');
      if (lastWarning) setWarning(lastWarning);
    } catch (err) {
      console.error('Earnings fetch error:', err);
      setError(err instanceof Error ? err.message : String(err));
      const mockData = mockEarningsData
        .filter((d) => d.date >= from && d.date <= to)
        .map((d) => ({ ...d, dataSource: 'mock' as const }));
      setEarningsData(mockData);
      setActiveSource('mock');
    } finally {
      setLoading(false);
    }
  }, [fetchFromApi, getDatesInRange]);

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

  // フィルター変更時にlocalStorageへ保存
  useEffect(() => {
    if (!filtersLoaded) return;
    try {
      localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(filters));
    } catch {
      // localStorage使用不可
    }
  }, [filters, filtersLoaded]);

  // 投資家フィルタ変更時にlocalStorageへ保存
  useEffect(() => {
    if (!filtersLoaded) return;
    try {
      localStorage.setItem(
        ADV_FILTERS_STORAGE_KEY,
        JSON.stringify({
          listedOnly,
          favoritesOnly,
          selectedMarkets: Array.from(selectedMarkets),
          marketCapMin,
          marketCapMax,
          quickFilter,
        }),
      );
    } catch {
      // localStorage使用不可
    }
  }, [listedOnly, favoritesOnly, selectedMarkets, marketCapMin, marketCapMax, quickFilter, filtersLoaded]);

  // 日付範囲変更時にlocalStorageへ保存
  useEffect(() => {
    if (!filtersLoaded) return;
    try {
      localStorage.setItem(DATE_RANGE_STORAGE_KEY, JSON.stringify({ from: dateFrom, to: dateTo }));
    } catch {
      // localStorage使用不可
    }
  }, [dateFrom, dateTo, filtersLoaded]);

  // 日付範囲・ソース・APIキー変更時にデータ取得
  useEffect(() => {
    if (!filtersLoaded) return;
    fetchEarningsRange(dateFrom, dateTo, dataSource, edinetApiKey);
  }, [dateFrom, dateTo, dataSource, edinetApiKey, fetchEarningsRange, filtersLoaded]);

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
        for (const key of clientCache.current.keys()) {
          if (key.startsWith(now + ':')) {
            clientCache.current.delete(key);
          }
        }
        prefetchWeek(dataSource, edinetApiKey);
      }
    };
    const interval = setInterval(checkDateChange, 30000);
    return () => clearInterval(interval);
  }, [dataSource, edinetApiKey, prefetchWeek]);

  // =========== 日付操作 ===========
  const rangeSpan = useCallback(() => {
    // 現在の範囲の日数を計算
    const fromDt = new Date(dateFrom);
    const toDt = new Date(dateTo);
    return Math.max(1, Math.round((toDt.getTime() - fromDt.getTime()) / (24 * 60 * 60 * 1000)) + 1);
  }, [dateFrom, dateTo]);

  const goToPrevDate = useCallback(() => {
    const span = rangeSpan();
    setDateFrom((prev) => shiftDate(prev, -span));
    setDateTo((prev) => shiftDate(prev, -span));
  }, [rangeSpan]);

  const goToNextDate = useCallback(() => {
    const span = rangeSpan();
    setDateFrom((prev) => shiftDate(prev, span));
    setDateTo((prev) => shiftDate(prev, span));
  }, [rangeSpan]);

  const goToToday = useCallback(() => {
    const today = getTodayStr();
    setDateFrom(today);
    setDateTo(today);
  }, []);

  // =========== フィルタ & ソート ===========
  const filteredData = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const hasUniverse = stockMap.size > 0;
    const minCap = marketCapMin !== '' ? parseFloat(marketCapMin) : null;
    const maxCap = marketCapMax !== '' ? parseFloat(marketCapMax) : null;

    return earningsData.filter((item) => {
      // 種別フィルター
      if (item.type === '決算' && !filters.決算短信) return false;
      if (item.type === '有報' && !filters.有報) return false;
      if (item.type === '有報訂正' && !filters.有報訂正) return false;
      if (item.type === '四半期' && !filters.四半期) return false;
      if (item.type === '四半期訂正' && !filters.四半期訂正) return false;
      if (item.type === '業績修正' && !filters.業績修正) return false;
      if (item.type === '配当修正' && !filters.配当修正) return false;

      const stock = stockMap.get(item.code);

      // 上場企業のみ: ユニバースに存在する銘柄だけ通す。ユニバース未ロード時は名称ベースで判定（ETF/REIT 除外のみ）
      if (listedOnly) {
        if (hasUniverse) {
          if (!stock) return false;
        } else {
          // フォールバック: 名称ベースで ETF/REIT 等を除外
          if (!isListedCompany({ name: item.companyName } as Stock)) return false;
        }
      }

      // お気に入り銘柄のみ
      if (favoritesOnly && !favoritesSet.has(item.code)) return false;

      // 市場区分フィルタ
      if (selectedMarkets.size > 0) {
        if (!stock || !selectedMarkets.has(stock.market)) return false;
      }

      // 時価総額レンジ（億円）
      if (minCap !== null || maxCap !== null) {
        if (!stock || !stock.marketCap || stock.marketCap <= 0) return false;
        const capOku = stock.marketCap / 100_000_000;
        if (minCap !== null && capOku < minCap) return false;
        if (maxCap !== null && capOku > maxCap) return false;
      }

      // クイックフィルタ
      switch (quickFilter) {
        case 'increase':
          if (item.type !== '決算' || item.netProfitYY == null || item.netProfitYY <= 0) return false;
          break;
        case 'decrease':
          if (item.type !== '決算' || item.netProfitYY == null || item.netProfitYY >= 0) return false;
          break;
        case 'upwardRevision':
          if (item.type !== '業績修正' || item.salesYY == null || item.salesYY <= 0) return false;
          break;
        case 'downwardRevision':
          if (item.type !== '業績修正' || item.salesYY == null || item.salesYY >= 0) return false;
          break;
        case 'beatConsensus':
          if (item.netProfitCon == null || item.netProfitCon <= 0) return false;
          break;
        case 'dividendUp':
          if (item.dividendChange == null || item.dividendChange <= 0) return false;
          break;
      }

      // テキスト検索
      if (q && !item.code.toLowerCase().includes(q) && !item.companyName.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [
    earningsData,
    filters,
    searchQuery,
    listedOnly,
    favoritesOnly,
    selectedMarkets,
    marketCapMin,
    marketCapMax,
    quickFilter,
    stockMap,
    favoritesSet,
  ]);

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
          <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium whitespace-nowrap ${
            salesYY && salesYY > 0 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
          }`}>
            修正{salesYY && salesYY > 0 ? '↑' : '↓'}
          </span>
        );
      case '有報':
        return <span className="inline-block px-1.5 py-0.5 rounded text-xs font-medium bg-purple-500/20 text-purple-400 whitespace-nowrap">有報</span>;
      case '有報訂正':
        return <span className="inline-block px-1.5 py-0.5 rounded text-xs font-medium bg-purple-500/20 text-orange-400 whitespace-nowrap">有報訂正</span>;
      case '四半期':
        return <span className="inline-block px-1.5 py-0.5 rounded text-xs font-medium bg-cyan-500/20 text-cyan-400 whitespace-nowrap">四半期</span>;
      case '四半期訂正':
        return <span className="inline-block px-1.5 py-0.5 rounded text-xs font-medium bg-cyan-500/20 text-orange-400 whitespace-nowrap">四半期訂正</span>;
      case '配当修正':
        return <span className="inline-block px-1.5 py-0.5 rounded text-xs font-medium bg-blue-500/20 text-blue-400 whitespace-nowrap">配当</span>;
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

  // 種別ごとの件数
  const typeCounts = useMemo(() => {
    const counts = { 決算: 0, 有報: 0, 有報訂正: 0, 四半期: 0, 四半期訂正: 0, 業績修正: 0, 配当修正: 0 };
    for (const item of earningsData) {
      if (item.type === '決算') counts.決算++;
      else if (item.type === '有報') counts.有報++;
      else if (item.type === '有報訂正') counts.有報訂正++;
      else if (item.type === '四半期') counts.四半期++;
      else if (item.type === '四半期訂正') counts.四半期訂正++;
      else if (item.type === '業績修正') counts.業績修正++;
      else if (item.type === '配当修正') counts.配当修正++;
    }
    return counts;
  }, [earningsData]);

  const filterKeyToType: Record<string, keyof typeof typeCounts> = {
    決算短信: '決算',
    有報: '有報',
    有報訂正: '有報訂正',
    四半期: '四半期',
    四半期訂正: '四半期訂正',
    業績修正: '業績修正',
    配当修正: '配当修正',
  };

  // サマリー統計
  const summary = useMemo(() => {
    let 増益 = 0, 減益 = 0, 上方修正 = 0, 下方修正 = 0;
    for (const item of filteredData) {
      if (item.type === '決算') {
        if (item.netProfitYY !== null && item.netProfitYY > 0) 増益++;
        else if (item.netProfitYY !== null && item.netProfitYY < 0) 減益++;
      } else if (item.type === '業績修正') {
        if (item.salesYY !== null && item.salesYY > 0) 上方修正++;
        else if (item.salesYY !== null && item.salesYY < 0) 下方修正++;
      }
    }
    return { 増益, 減益, 上方修正, 下方修正 };
  }, [filteredData]);

  // キーボードショートカット
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // input/selectにフォーカス中はスキップ
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goToPrevDate();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goToNextDate();
      } else if (e.key === 'Escape') {
        setSelectedCompany(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToPrevDate, goToNextDate]);

  // 外部リンク生成
  const getExternalLinks = (code: string) => [
    { label: '株探', url: `https://kabutan.jp/stock/finance?code=${code}` },
    { label: 'IR BANK', url: `https://irbank.net/${code}` },
    { label: 'Yahoo', url: `https://finance.yahoo.co.jp/quote/${code}.T` },
  ];

  // サプライズ判定: 純利益のコンセンサス比乖離が ±10% 以上で「要チェック」
  const SURPRISE_THRESHOLD = 10;
  const isSurprise = (item: EarningsData): boolean =>
    item.netProfitCon != null && Math.abs(item.netProfitCon) >= SURPRISE_THRESHOLD;

  // CSV エクスポート（投資家目線で最低限の列）
  const handleExportCSV = useCallback(() => {
    if (sortedData.length === 0) return;
    const rows = sortedData.map((d) => {
      const stock = stockMap.get(d.code);
      return {
        date: d.date,
        time: d.time,
        code: d.code,
        companyName: d.companyName,
        market: stock?.market || '',
        marketCapOku: stock && stock.marketCap > 0 ? Math.round(stock.marketCap / 100_000_000) : '',
        type: d.type,
        salesYY: d.salesYY ?? '',
        operatingProfitYY: d.operatingProfitYY ?? '',
        ordinaryProfitYY: d.ordinaryProfitYY ?? '',
        netProfitYY: d.netProfitYY ?? '',
        salesCon: d.salesCon ?? '',
        operatingProfitCon: d.operatingProfitCon ?? '',
        ordinaryProfitCon: d.ordinaryProfitCon ?? '',
        netProfitCon: d.netProfitCon ?? '',
        dividend: d.dividend ?? '',
        dividendChange: d.dividendChange ?? '',
        dataSource: d.dataSource ?? '',
      };
    });
    const csv = convertToCSV(rows);
    // Excel で文字化けしないよう BOM を付ける
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `earnings_${dateFrom}_${dateTo}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [sortedData, stockMap, dateFrom, dateTo]);

  // 市場区分のトグル
  const toggleMarket = (market: string) => {
    setSelectedMarkets((prev) => {
      const next = new Set(prev);
      if (next.has(market)) next.delete(market);
      else next.add(market);
      return next;
    });
  };

  // 投資家フィルタのリセット
  const resetAdvFilters = () => {
    setListedOnly(true);
    setFavoritesOnly(false);
    setSelectedMarkets(new Set());
    setMarketCapMin('');
    setMarketCapMax('');
    setQuickFilter('all');
  };

  const advFilterActiveCount =
    (favoritesOnly ? 1 : 0) +
    (selectedMarkets.size > 0 ? 1 : 0) +
    (marketCapMin !== '' || marketCapMax !== '' ? 1 : 0) +
    (quickFilter !== 'all' ? 1 : 0);

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
        {/* ヘッダー */}
        <div className="mb-4 sm:mb-6">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4">
            <h1 className="text-xl sm:text-2xl font-bold">決算分析ビューア</h1>
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <button type="button" onClick={goToPrevDate} className="px-2 sm:px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm min-w-[44px]">
                ◀
              </button>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  if (e.target.value) {
                    setDateFrom(e.target.value);
                    if (e.target.value > dateTo) setDateTo(e.target.value);
                  }
                }}
                className="px-1.5 sm:px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-sm text-white [color-scheme:dark] min-w-0"
              />
              <span className="text-gray-400 text-sm">〜</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  if (e.target.value) {
                    setDateTo(e.target.value);
                    if (e.target.value < dateFrom) setDateFrom(e.target.value);
                  }
                }}
                className="px-1.5 sm:px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-sm text-white [color-scheme:dark] min-w-0"
              />
              <button type="button" onClick={goToNextDate} className="px-2 sm:px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm min-w-[44px]">
                ▶
              </button>
              <button type="button" onClick={goToToday} className="px-2 sm:px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-sm whitespace-nowrap">
                今日
              </button>
              <button
                type="button"
                onClick={() => fetchEarningsRange(dateFrom, dateTo, dataSource, edinetApiKey, true)}
                disabled={loading}
                className="px-2 sm:px-3 py-1.5 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 rounded text-sm whitespace-nowrap"
              >
                {loading ? '...' : '更新'}
              </button>
            </div>
          </div>

          {/* 検索 & データソース */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-2">
            <input
              type="text"
              placeholder="コード / 企業名で検索"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="px-2.5 py-1.5 bg-gray-700 border border-gray-600 rounded text-sm text-white placeholder-gray-500 w-40 sm:w-52"
            />
            <select
              value={dataSource}
              onChange={(e) => setDataSource(e.target.value as DataSource)}
              className="px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-sm text-white"
            >
              <option value="auto">自動（EDINET優先）</option>
              <option value="edinet">EDINET</option>
              <option value="mock">モックデータ</option>
            </select>
            <span className="text-xs text-gray-400 ml-auto whitespace-nowrap">
              {filteredData.length}/{earningsData.length}件
            </span>
          </div>

          {/* フィルター */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mb-3">
            {Object.entries(filters).map(([key, value]) => {
              const typeKey = filterKeyToType[key];
              const count = typeKey ? typeCounts[typeKey] : 0;
              return (
                <label key={key} className={`flex items-center gap-1.5 cursor-pointer ${count === 0 ? 'opacity-50' : ''}`}>
                  <input
                    type="checkbox"
                    checked={value}
                    onChange={(e) => setFilters({ ...filters, [key]: e.target.checked })}
                    className="w-3.5 h-3.5"
                  />
                  <span className="text-xs sm:text-sm">{key}</span>
                  <span className="text-xs text-gray-500">({count})</span>
                </label>
              );
            })}
          </div>

          {/* 投資家目線フィルタ（銘柄絞り込み + クイックフィルタ + CSV） */}
          <div className="bg-gray-800/40 border border-gray-700 rounded-lg px-3 py-2 mb-3 space-y-2">
            {/* 1段目: 常時表示 */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={listedOnly}
                  onChange={(e) => setListedOnly(e.target.checked)}
                  className="w-3.5 h-3.5"
                />
                <span className="text-xs sm:text-sm">上場企業のみ</span>
                <span className="text-xs text-gray-500">(ETF・REIT・非上場を除外)</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={favoritesOnly}
                  onChange={(e) => setFavoritesOnly(e.target.checked)}
                  className="w-3.5 h-3.5"
                />
                <span className="text-xs sm:text-sm">★ お気に入りのみ</span>
                <span className="text-xs text-gray-500">({favoritesSet.size}銘柄)</span>
              </label>
              <select
                value={quickFilter}
                onChange={(e) => setQuickFilter(e.target.value as QuickFilter)}
                className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-xs sm:text-sm text-white"
                title="投資判断のクイックフィルタ"
              >
                <option value="all">全て</option>
                <option value="increase">増益のみ（決算・利YY&gt;0）</option>
                <option value="decrease">減益のみ（決算・利YY&lt;0）</option>
                <option value="upwardRevision">上方修正のみ</option>
                <option value="downwardRevision">下方修正のみ</option>
                <option value="beatConsensus">コンセンサス超過（利Con&gt;0）</option>
                <option value="dividendUp">配当増額</option>
              </select>
              <button
                type="button"
                onClick={() => setShowAdvFilters((v) => !v)}
                className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs sm:text-sm whitespace-nowrap"
              >
                詳細 {showAdvFilters ? '▲' : '▼'}
                {advFilterActiveCount > 0 && (
                  <span className="ml-1 px-1 rounded bg-blue-600 text-white text-[10px]">{advFilterActiveCount}</span>
                )}
              </button>
              <div className="ml-auto flex items-center gap-2">
                {advFilterActiveCount > 0 && (
                  <button
                    type="button"
                    onClick={resetAdvFilters}
                    className="px-2 py-1 text-xs text-gray-400 hover:text-white whitespace-nowrap"
                  >
                    条件クリア
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleExportCSV}
                  disabled={sortedData.length === 0}
                  className="px-2 py-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed rounded text-xs sm:text-sm whitespace-nowrap"
                  title="表示中の決算データをCSVエクスポート"
                >
                  CSV
                </button>
              </div>
            </div>

            {/* 2段目: 詳細フィルタ（折りたたみ） */}
            {showAdvFilters && (
              <div className="pt-2 border-t border-gray-700 space-y-2">
                {/* 市場区分 */}
                {availableMarkets.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-gray-400 mr-1">市場:</span>
                    {availableMarkets.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => toggleMarket(m)}
                        className={`px-2 py-0.5 rounded text-xs border transition-colors ${
                          selectedMarkets.has(m)
                            ? 'bg-blue-600 border-blue-500 text-white'
                            : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                    {selectedMarkets.size > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedMarkets(new Set())}
                        className="text-xs text-gray-400 hover:text-white ml-1"
                      >
                        ✕ クリア
                      </button>
                    )}
                  </div>
                )}
                {/* 時価総額レンジ */}
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="text-gray-400">時価総額:</span>
                  <input
                    type="number"
                    placeholder="最小"
                    value={marketCapMin}
                    onChange={(e) => setMarketCapMin(e.target.value)}
                    className="w-20 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-500"
                  />
                  <span className="text-gray-500">〜</span>
                  <input
                    type="number"
                    placeholder="最大"
                    value={marketCapMax}
                    onChange={(e) => setMarketCapMax(e.target.value)}
                    className="w-20 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-500"
                  />
                  <span className="text-gray-500">億円</span>
                  <span className="text-gray-600 ml-2">
                    目安: 大型 1000億〜 / 中型 300〜1000億 / 小型 〜300億
                  </span>
                </div>
                {stockMap.size === 0 && (
                  <p className="text-xs text-yellow-400">
                    株価データが未取得のため、市場区分・時価総額フィルタは機能しません。メイン画面を開いてからお試しください。
                  </p>
                )}
              </div>
            )}
          </div>

          {/* サマリーバー */}
          {filteredData.length > 0 && (
            <div className="flex flex-wrap gap-3 sm:gap-4 mb-4 text-xs">
              {summary.増益 > 0 && (
                <span className="px-2 py-1 rounded bg-green-500/15 text-green-400">増益 {summary.増益}社</span>
              )}
              {summary.減益 > 0 && (
                <span className="px-2 py-1 rounded bg-red-500/15 text-red-400">減益 {summary.減益}社</span>
              )}
              {summary.上方修正 > 0 && (
                <span className="px-2 py-1 rounded bg-emerald-500/15 text-emerald-400">上方修正 {summary.上方修正}社</span>
              )}
              {summary.下方修正 > 0 && (
                <span className="px-2 py-1 rounded bg-orange-500/15 text-orange-400">下方修正 {summary.下方修正}社</span>
              )}
            </div>
          )}

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
                EDINET APIキーを設定すると、決算短信の実データを表示できます。
              </p>
              <p className="text-xs text-blue-400">
                <a href="/settings" className="underline hover:text-blue-200">設定ページ</a>でAPIキーを登録してください（無料）。
              </p>
            </div>
          )}
        </div>

        {/* ローディング */}
        {loading ? (
          <div className="bg-gray-800 rounded-lg flex items-center justify-center py-12 mb-6">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400" />
            <span className="ml-3 text-gray-400">データを取得中...</span>
          </div>
        ) : (
          <>
            {/* デスクトップ: テーブル表示 */}
            <div className="hidden md:block bg-gray-800 rounded-lg overflow-hidden mb-6">
              <div className="overflow-x-auto max-h-[70vh]">
                <table className="w-full text-sm">
                  <thead className="bg-gray-700 sticky top-0 z-10">
                    <tr>
                      {dateFrom !== dateTo && (
                        <th className="px-3 py-2 text-left text-xs font-medium uppercase">日付</th>
                      )}
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
                        <td colSpan={dateFrom !== dateTo ? 17 : 16} className="px-3 py-8 text-center text-gray-400">
                          {earningsData.length === 0 ? 'この日付のデータはありません' : 'フィルター条件に一致するデータがありません'}
                        </td>
                      </tr>
                    ) : (
                      sortedData.map((data, index) => {
                        const surprise = isSurprise(data);
                        const isFav = favoritesSet.has(data.code);
                        const isSelected = selectedCompany?.code === data.code && selectedCompany?.date === data.date;
                        const stock = stockMap.get(data.code);
                        const rowBg = isSelected
                          ? 'bg-blue-900/30'
                          : surprise
                            ? 'bg-yellow-900/15 hover:bg-yellow-900/25'
                            : 'hover:bg-gray-700/50';
                        return (
                        <tr
                          key={`${data.code}-${data.date}-${index}`}
                          onClick={() => setSelectedCompany(data)}
                          className={`cursor-pointer ${rowBg}`}
                        >
                          {dateFrom !== dateTo && (
                            <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{formatDateShort(data.date)}</td>
                          )}
                          <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{data.time}</td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {isFav && <span className="text-yellow-400 mr-1" title="お気に入り">★</span>}
                            {surprise && <span className="text-yellow-300 mr-1" title={`コンセンサス比 ${formatPercent(data.netProfitCon)}`}>⚡</span>}
                            <span className="text-gray-400">{data.code}</span>{' '}
                            <span>{data.companyName}</span>
                            {stock && (
                              <span className="ml-1 text-[10px] text-gray-500">
                                {stock.market}{stock.marketCap > 0 ? ` / ${formatMarketCap(stock.marketCap)}` : ''}
                              </span>
                            )}
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
                                  配当{data.dividend.toFixed(1)}円
                                  {data.dividendChange !== null && data.dividendChange !== undefined && (
                                    <span className={data.dividendChange >= 0 ? ' text-green-400' : ' text-red-400'}>
                                      ({formatPercent(data.dividendChange)})
                                    </span>
                                  )}
                                </span>
                              )}
                              {data.edinetDocId && (
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); openEdinetDoc(data.edinetDocId); }}
                                  className="text-blue-400 hover:text-blue-300 underline"
                                >
                                  PDF
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* モバイル: ソート切替 */}
            <div className="md:hidden flex items-center gap-2 mb-2">
              <span className="text-xs text-gray-400">並替:</span>
              {[
                { key: 'salesYY', label: '売YY' },
                { key: 'operatingProfitYY', label: '営YY' },
                { key: 'netProfitYY', label: '利YY' },
              ].map((col) => (
                <button
                  key={col.key}
                  type="button"
                  onClick={() => handleSort(col.key)}
                  className={`px-2 py-1 rounded text-xs ${
                    sortConfig?.key === col.key
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {col.label}{sortConfig?.key === col.key ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}
                </button>
              ))}
              {sortConfig && (
                <button
                  type="button"
                  onClick={() => setSortConfig(null)}
                  className="px-2 py-1 rounded text-xs bg-gray-700 text-gray-400 hover:bg-gray-600"
                >
                  ✕
                </button>
              )}
            </div>

            {/* モバイル: カード表示 */}
            <div className="md:hidden space-y-2 mb-6">
              {sortedData.length === 0 ? (
                <div className="bg-gray-800 rounded-lg px-4 py-8 text-center text-gray-400">
                  {earningsData.length === 0 ? 'この日付のデータはありません' : 'フィルター条件に一致するデータがありません'}
                </div>
              ) : (
                sortedData.map((data, index) => {
                  const surprise = isSurprise(data);
                  const isFav = favoritesSet.has(data.code);
                  const isSelected = selectedCompany?.code === data.code && selectedCompany?.date === data.date;
                  const stock = stockMap.get(data.code);
                  const cardBg = isSelected
                    ? 'bg-gray-800 ring-1 ring-blue-500'
                    : surprise
                      ? 'bg-yellow-900/15 ring-1 ring-yellow-600/40'
                      : 'bg-gray-800';
                  return (
                  <div
                    key={`m-${data.code}-${data.date}-${index}`}
                    onClick={() => setSelectedCompany(data)}
                    className={`${cardBg} rounded-lg p-3 cursor-pointer active:bg-gray-700`}
                  >
                    {/* 1行目: 企業情報 */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {getTypeBadge(data.type, data.salesYY)}
                        {isFav && <span className="text-yellow-400 text-xs" title="お気に入り">★</span>}
                        {surprise && <span className="text-yellow-300 text-xs" title={`コンセンサス比 ${formatPercent(data.netProfitCon)}`}>⚡</span>}
                        <span className="text-gray-400 text-xs">{data.code}</span>
                        <span className="text-sm font-medium truncate">{data.companyName}</span>
                      </div>
                      <span className="text-xs text-gray-500 shrink-0 ml-2">
                        {dateFrom !== dateTo && `${formatDateShort(data.date)} `}{data.time}
                      </span>
                    </div>
                    {stock && (
                      <div className="text-[10px] text-gray-500 mb-1">
                        {stock.market}{stock.marketCap > 0 ? ` / ${formatMarketCap(stock.marketCap)}` : ''}
                      </div>
                    )}
                    {/* 2行目: YoY指標 */}
                    <div className="grid grid-cols-4 gap-1 text-xs">
                      {[
                        { label: '売YY', val: data.salesYY },
                        { label: '営YY', val: data.operatingProfitYY },
                        { label: '経YY', val: data.ordinaryProfitYY },
                        { label: '利YY', val: data.netProfitYY },
                      ].map((col) => (
                        <div key={col.label} className="text-center">
                          <div className="text-gray-500">{col.label}</div>
                          <div className={col.val !== null && col.val !== undefined
                            ? (col.val >= 0 ? 'text-green-400 font-medium' : 'text-red-400 font-medium')
                            : 'text-gray-600'
                          }>
                            {col.val !== null && col.val !== undefined ? formatPercent(col.val) : '-'}
                          </div>
                        </div>
                      ))}
                    </div>
                    {/* 3行目: QoQ指標（値がある場合のみ） */}
                    {(data.salesQQ !== null || data.operatingProfitQQ !== null || data.ordinaryProfitQQ !== null || data.netProfitQQ !== null) && (
                      <div className="grid grid-cols-4 gap-1 text-xs mt-1">
                        {[
                          { label: '売QQ', val: data.salesQQ },
                          { label: '営QQ', val: data.operatingProfitQQ },
                          { label: '経QQ', val: data.ordinaryProfitQQ },
                          { label: '利QQ', val: data.netProfitQQ },
                        ].map((col) => (
                          <div key={col.label} className="text-center">
                            <div className="text-gray-500">{col.label}</div>
                            <div className={col.val !== null && col.val !== undefined
                              ? (col.val >= 0 ? 'text-green-400 font-medium' : 'text-red-400 font-medium')
                              : 'text-gray-600'
                            }>
                              {col.val !== null && col.val !== undefined ? formatPercent(col.val) : '-'}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {/* 配当情報 */}
                    {data.dividend !== null && data.dividend !== undefined && (
                      <div className="mt-1.5 text-xs text-gray-400">
                        配当 {data.dividend.toFixed(1)}円
                        {data.dividendChange !== null && data.dividendChange !== undefined && (
                          <span className={data.dividendChange >= 0 ? ' text-green-400' : ' text-red-400'}>
                            ({formatPercent(data.dividendChange)})
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  );
                })
              )}
            </div>
          </>
        )}

        {/* 詳細パネル */}
        {selectedCompany && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            <div className="bg-gray-800 rounded-lg p-4 sm:p-6">
              <div className="flex items-start justify-between gap-2 mb-4">
                <div className="flex items-center gap-2 flex-wrap">
                  {getTypeBadge(selectedCompany.type, selectedCompany.salesYY)}
                  <h2 className="text-lg sm:text-xl font-bold">
                    {selectedCompany.code} {selectedCompany.companyName}
                  </h2>
                  {getSourceBadge(selectedCompany.dataSource)}
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedCompany(null)}
                  className="text-gray-400 hover:text-white text-lg shrink-0"
                  aria-label="閉じる"
                >
                  ✕
                </button>
              </div>
              <div className="space-y-4">
                {selectedCompany.edinetDocDescription && (
                  <div className="bg-gray-700/50 rounded p-3 text-sm">
                    <span className="text-gray-400">書類: </span>
                    <span>{selectedCompany.edinetDocDescription}</span>
                  </div>
                )}
                <div>
                  <h3 className="font-semibold mb-2 text-sm text-gray-300">業績（YoY / QoQ）</h3>
                  <div className="space-y-1.5 text-sm">
                    {[
                      { label: '売上高', yy: selectedCompany.salesYY, qq: selectedCompany.salesQQ },
                      { label: '営業利益', yy: selectedCompany.operatingProfitYY, qq: selectedCompany.operatingProfitQQ },
                      { label: '経常利益', yy: selectedCompany.ordinaryProfitYY, qq: selectedCompany.ordinaryProfitQQ },
                      { label: '純利益', yy: selectedCompany.netProfitYY, qq: selectedCompany.netProfitQQ },
                    ].map((row) => (
                      <div key={row.label} className="flex justify-between items-center">
                        <span className="text-gray-400">{row.label}</span>
                        <div className="flex gap-4">
                          <span className="w-20 text-right">
                            {row.yy !== null && row.yy !== undefined ? (
                              <span className={row.yy >= 0 ? 'text-green-400' : 'text-red-400'}>{formatPercent(row.yy)}</span>
                            ) : <span className="text-gray-600">-</span>}
                          </span>
                          <span className="w-20 text-right">
                            {row.qq !== null && row.qq !== undefined ? (
                              <span className={row.qq >= 0 ? 'text-green-400' : 'text-red-400'}>{formatPercent(row.qq)}</span>
                            ) : <span className="text-gray-600">-</span>}
                          </span>
                        </div>
                      </div>
                    ))}
                    <div className="flex justify-end gap-4 text-xs text-gray-500 border-t border-gray-700 pt-1">
                      <span className="w-20 text-right">YoY</span>
                      <span className="w-20 text-right">QoQ</span>
                    </div>
                  </div>
                </div>
                <div>
                  <h3 className="font-semibold mb-2 text-sm text-gray-300">配当</h3>
                  <div className="text-sm">
                    {selectedCompany.dividend !== null && selectedCompany.dividend !== undefined ? (
                      <span>
                        {selectedCompany.dividend.toFixed(2)}円
                        {selectedCompany.dividendChange !== null && selectedCompany.dividendChange !== undefined && (
                          <span className={selectedCompany.dividendChange >= 0 ? ' text-green-400' : ' text-red-400'}>
                            （前期比 {formatPercent(selectedCompany.dividendChange)}）
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-gray-500">情報なし</span>
                    )}
                  </div>
                </div>
                {/* 外部リンク */}
                <div>
                  <h3 className="font-semibold mb-2 text-sm text-gray-300">外部リンク</h3>
                  <div className="flex flex-wrap gap-2">
                    {selectedCompany.edinetDocId && (
                      <button
                        type="button"
                        onClick={() => openEdinetDoc(selectedCompany.edinetDocId)}
                        className="px-3 py-1.5 bg-green-700 hover:bg-green-600 rounded text-xs font-medium"
                      >
                        EDINET PDF
                      </button>
                    )}
                    {getExternalLinks(selectedCompany.code).map((link) => (
                      <a
                        key={link.label}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-xs font-medium"
                      >
                        {link.label}
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-gray-800 rounded-lg p-4 sm:p-6">
              {selectedCompany.segments ? (
                <>
                  <h2 className="text-lg sm:text-xl font-bold mb-4">セグメント別業績 ({selectedCompany.segments.period})</h2>
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
                                <td className="px-3 py-2 text-right">{(seg.sales / 1000000).toFixed(0)}</td>
                                <td className="px-3 py-2 text-right">{(seg.profit / 1000000).toFixed(0)}</td>
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
                  <h2 className="text-lg sm:text-xl font-bold mb-4">書類情報</h2>
                  <div className="space-y-3 text-sm">
                    {selectedCompany.edinetDocDescription && (
                      <div><span className="text-gray-400">書類種別: </span>{selectedCompany.edinetDocDescription}</div>
                    )}
                    <div><span className="text-gray-400">提出日時: </span>{selectedCompany.date} {selectedCompany.time}</div>
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
