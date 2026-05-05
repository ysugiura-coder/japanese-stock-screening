'use client';

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { EarningsData, CompanyHistoryResponse } from '@/lib/types/financial';
import { Stock, StocksResponse } from '@/lib/types/stock';
import { mockEarningsData } from '@/lib/data/mock-earnings';
import { formatPercent, formatMarketCap, convertToCSV } from '@/lib/utils/format';
import { isListedCompany, getExchange, EXCHANGE_ORDER } from '@/lib/utils/screening';
import { getFavorites } from '@/lib/utils/favorites';

type SortConfig = { key: string; direction: 'asc' | 'desc' } | null;
type DataSource = 'auto' | 'tdnet' | 'mock';

/**
 * J-Quants レート制限 (HTTP 429) を表す。
 * fetchFromApi の throw 経路でこの型を投げると、上位 (fetchEarningsRange) が
 * 「表示中の実データを mock で書き換えない」「retryAfter 秒後に自動再試行」分岐に入る。
 */
class RateLimitError extends Error {
  retryAfter: number;
  constructor(message: string, retryAfter: number) {
    super(message);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}
type QuickFilter =
  | 'all'
  | 'increase'
  | 'decrease'
  | 'upwardRevision'
  | 'downwardRevision'
  | 'dividendUp';

// サプライズ閾値のデフォルト（%）。YoY の絶対値がこの値以上で ⚡ をハイライト
const DEFAULT_SURPRISE_THRESHOLD = 30;
const SURPRISE_THRESHOLD_STORAGE = 'earnings_surprise_threshold';

// J-Quants APIキー（リフレッシュトークン）は /settings の J-Quants 設定で保存される
const JQUANTS_API_KEY_STORAGE = 'jquants_api_key';
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
  const [jquantsApiKey, setJquantsApiKey] = useState('');
  const [earningsData, setEarningsData] = useState<EarningsData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSource, setActiveSource] = useState<string>('mock');
  const [warning, setWarning] = useState<string | null>(null);
  // レート制限 (429) ヒット時の状態。自動再試行の残秒数を持つ。
  // null の間はレート制限ではない通常状態。
  const [rateLimit, setRateLimit] = useState<{ retryAt: number; message: string } | null>(null);
  const [now, setNow] = useState(Date.now());
  // バックグラウンド補完の進捗 (incompleteCodes をクライアントから漸進的に埋める)
  const [refillProgress, setRefillProgress] = useState<{ done: number; total: number } | null>(null);
  // 進行中の refill ループを差し替えるための増分カウンタ
  const refillRunIdRef = useRef(0);
  const [dateFrom, setDateFrom] = useState(getTodayStr);
  const [dateTo, setDateTo] = useState(getTodayStr);
  const [selectedCompany, setSelectedCompany] = useState<EarningsData | null>(null);
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const DATE_RANGE_STORAGE_KEY = 'earnings_date_range';
  const FILTERS_STORAGE_KEY = 'earnings_filters';
  const defaultFilters = {
    決算短信: true,
    四半期: true,
    業績修正: true,
    配当修正: true,
  };
  const [filters, setFilters] = useState(defaultFilters);
  const [filtersLoaded, setFiltersLoaded] = useState(false);

  // ── 投資家目線フィルタ state ──
  const [listedOnly, setListedOnly] = useState(true);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [selectedExchanges, setSelectedExchanges] = useState<Set<string>>(new Set());
  const [selectedMarkets, setSelectedMarkets] = useState<Set<string>>(new Set());
  const [marketCapMin, setMarketCapMin] = useState<string>(''); // 億円、空文字で無制限
  const [marketCapMax, setMarketCapMax] = useState<string>('');
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');
  const [showAdvFilters, setShowAdvFilters] = useState(false);
  const [favoritesSet, setFavoritesSet] = useState<Set<string>>(new Set());
  const [surpriseThreshold, setSurpriseThreshold] = useState<number>(DEFAULT_SURPRISE_THRESHOLD);

  // ── 四半期推移ビュー（選択銘柄の過去 8 四半期） ──
  const [historyData, setHistoryData] = useState<CompanyHistoryResponse | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

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

  // 上場場所（取引所）の候補一覧。ユニバース実在分のみ EXCHANGE_ORDER 順で返す
  const availableExchanges = useMemo(() => {
    const set = new Set<string>();
    stockMap.forEach((s) => {
      set.add(getExchange(s.market));
    });
    return EXCHANGE_ORDER.filter((ex) => set.has(ex));
  }, [stockMap]);

  // クライアント側キャッシュ: 日付→データ をメモリに保持（1週間分）。
  // incompleteCodes はサーバが date-pivot で引き当てきれなかった銘柄。
  // /api/earnings/refill で漸進補完するためにキャッシュにも持たせ、refill 完了時に空にする。
  const clientCache = useRef<
    Map<string, { earnings: EarningsData[]; source: string; fetchedAt: number; incompleteCodes?: string[] }>
  >(new Map());
  const lastTodayRef = useRef(getTodayStr());

  // localStorage からAPIキーとフィルター設定を読み込み
  useEffect(() => {
    try {
      const savedKey = localStorage.getItem(JQUANTS_API_KEY_STORAGE) || '';
      setJquantsApiKey(savedKey);
      const savedFilters = localStorage.getItem(FILTERS_STORAGE_KEY);
      if (savedFilters) {
        const parsed = JSON.parse(savedFilters);
        // 旧版に存在した有報/有報訂正/四半期訂正のキーは無視する
        const filtered: Partial<typeof defaultFilters> = {};
        for (const key of Object.keys(defaultFilters) as Array<keyof typeof defaultFilters>) {
          if (typeof parsed[key] === 'boolean') filtered[key] = parsed[key];
        }
        setFilters({ ...defaultFilters, ...filtered });
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
        if (Array.isArray(a.selectedExchanges)) setSelectedExchanges(new Set(a.selectedExchanges));
        if (Array.isArray(a.selectedMarkets)) setSelectedMarkets(new Set(a.selectedMarkets));
        if (typeof a.marketCapMin === 'string') setMarketCapMin(a.marketCapMin);
        if (typeof a.marketCapMax === 'string') setMarketCapMax(a.marketCapMax);
        if (typeof a.quickFilter === 'string') setQuickFilter(a.quickFilter);
      }
      const savedThreshold = localStorage.getItem(SURPRISE_THRESHOLD_STORAGE);
      if (savedThreshold) {
        const n = Number(savedThreshold);
        if (Number.isFinite(n) && n >= 0) setSurpriseThreshold(n);
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
  const fetchFromApi = useCallback(async (
    date: string,
    source: DataSource,
    apiKey: string,
    forceRefresh = false,
  ): Promise<{
    earnings: EarningsData[];
    source: string;
    warning?: string;
    incompleteCodes?: string[];
  }> => {
    // モックデータを使う場合
    const useMock = source === 'mock' || (!apiKey && source !== 'tdnet');
    if (useMock) {
      const mockData = mockEarningsData
        .filter((d) => d.date === date)
        .map((d) => ({ ...d, dataSource: 'mock' as const }));
      return { earnings: mockData, source: 'mock', warning: !apiKey && source !== 'mock' ? 'J-Quants APIキーが設定されていません。設定ページで登録してください。' : undefined };
    }

    // API から取得
    const headers: Record<string, string> = {};
    if (apiKey) headers['x-jquants-api-key'] = apiKey;

    const params = new URLSearchParams({ date, source });
    if (forceRefresh) params.set('clearCache', 'true');
    const res = await fetch(`/api/earnings?${params}`, { headers });

    // Vercel 関数タイムアウト等で HTML/テキストが返る場合があるため、
    // Content-Type を見て JSON でなければ生テキストでエラー化する。
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      const text = await res.text();
      const isTimeout = /FUNCTION_INVOCATION_TIMEOUT/i.test(text);
      const snippet = text.replace(/\s+/g, ' ').trim().substring(0, 200);
      throw new Error(
        isTimeout
          ? `サーバ処理が時間内に終わりませんでした（Vercel 60s タイムアウト）。同じ日付をもう一度開くと、キャッシュで段階的に表示されるはずです。`
          : `サーバから JSON 以外が返されました (HTTP ${res.status}): ${snippet}`,
      );
    }

    const data = await res.json();
    if (!res.ok) {
      if (res.status === 429) {
        const retryAfter =
          typeof data.retryAfter === 'number' && data.retryAfter > 0
            ? data.retryAfter
            : Number(res.headers.get('retry-after')) || 60;
        throw new RateLimitError(
          data.error || 'J-Quants レート制限のため取得できませんでした',
          retryAfter,
        );
      }
      throw new Error(data.error || `API error: ${res.status}`);
    }
    return {
      earnings: data.earnings || [],
      source: data.source || 'unknown',
      warning: data.warning,
      incompleteCodes: Array.isArray(data.incompleteCodes) ? data.incompleteCodes : undefined,
    };
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

  // 単一銘柄の YoY/QoQ を refill エンドポイントから取得
  const fetchRefill = useCallback(
    async (date: string, code: string, apiKey: string): Promise<EarningsData[]> => {
      const headers: Record<string, string> = {};
      if (apiKey) headers['x-jquants-api-key'] = apiKey;
      const res = await fetch(`/api/earnings/refill?date=${encodeURIComponent(date)}&code=${encodeURIComponent(code)}`, { headers });
      if (res.status === 429) {
        const data = await res.json().catch(() => ({}));
        const retryAfter =
          typeof data.retryAfter === 'number' && data.retryAfter > 0
            ? data.retryAfter
            : Number(res.headers.get('retry-after')) || 60;
        throw new RateLimitError('refill rate limit', retryAfter);
      }
      if (!res.ok) return []; // 個別失敗は致命的でないので空で続行
      const data = await res.json().catch(() => ({}));
      return Array.isArray(data.earnings) ? (data.earnings as EarningsData[]) : [];
    },
    [],
  );

  // バックグラウンド補完ループ。
  // refillRunIdRef で「直近のループのみ進める」ロックを取り、新しいフェッチが走ったら旧ループは即停止。
  const runRefillLoop = useCallback(
    async (jobs: { date: string; code: string }[], apiKey: string) => {
      if (jobs.length === 0) {
        setRefillProgress(null);
        return;
      }
      const runId = ++refillRunIdRef.current;
      setRefillProgress({ done: 0, total: jobs.length });

      const rowKey = (r: { code: string; time: string; disclosureNumber?: string }) =>
        `${r.code}:${r.disclosureNumber || r.time}`;

      let done = 0;
      for (const { date, code } of jobs) {
        if (refillRunIdRef.current !== runId) return; // 別ループに置き換わった
        try {
          const refilled = await fetchRefill(date, code, apiKey);
          if (refillRunIdRef.current !== runId) return;
          if (refilled.length > 0) {
            const byKey = new Map(refilled.map((r) => [rowKey(r), r]));
            // 表示中データを置き換え (一致する code+disclosureNumber 行のみ更新)
            setEarningsData((prev) =>
              prev.map((row) => byKey.get(rowKey(row)) ?? row),
            );
            // クライアントキャッシュ側にも反映 (次回開いたときも YoY が埋まった状態)
            const cacheKey = `${date}:tdnet`;
            const cached = clientCache.current.get(cacheKey) || clientCache.current.get(`${date}:auto`);
            if (cached) {
              cached.earnings = cached.earnings.map((row) => byKey.get(rowKey(row)) ?? row);
              if (cached.incompleteCodes) {
                cached.incompleteCodes = cached.incompleteCodes.filter((c) => c !== code);
              }
            }
          }
        } catch (e) {
          if (e instanceof RateLimitError) {
            // refill 中にレート制限ヒット → 既存の rate limit UI と同じ仕組みに乗せて中断。
            // 自動再試行で fetchEarningsRange が再開すれば、また refill ループも立ち上がる。
            setRateLimit({
              retryAt: Date.now() + e.retryAfter * 1000,
              message: `バックグラウンド補完中にレート制限を検知。残り ${jobs.length - done} 銘柄は待機後に再開します。`,
            });
            setRefillProgress(null);
            return;
          }
          // 個別エラーは無視して続行
        }
        done++;
        if (refillRunIdRef.current !== runId) return;
        setRefillProgress({ done, total: jobs.length });
        // J-Quants 側の同時実行制限と相性を取るため間隔を空ける
        await new Promise((r) => setTimeout(r, 250));
      }
      if (refillRunIdRef.current === runId) setRefillProgress(null);
    },
    [fetchRefill],
  );

  // データ取得（範囲対応・クライアントキャッシュ優先）
  const fetchEarningsRange = useCallback(async (from: string, to: string, source: DataSource, apiKey: string, forceRefresh = false) => {
    const dates = getDatesInRange(from, to);
    const today = getTodayStr();

    // 新しいフェッチが始まったら、進行中の refill ループはキャンセル
    refillRunIdRef.current++;
    setRefillProgress(null);

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
        // キャッシュからの復元時も、未補完銘柄が残っていれば refill ループを再起動
        const refillJobs: { date: string; code: string }[] = [];
        for (const date of dates) {
          const cached = clientCache.current.get(`${date}:${source}`);
          if (cached?.incompleteCodes?.length) {
            for (const c of cached.incompleteCodes) refillJobs.push({ date, code: c });
          }
        }
        if (refillJobs.length > 0 && source !== 'mock' && apiKey) {
          runRefillLoop(refillJobs, apiKey);
        }
        return;
      }
    }

    setLoading(true);
    setError(null);
    setWarning(null);
    setSelectedCompany(null);

    try {
      // J-Quants V2 のレート制限が厳しいため、範囲は順次取得（1 日ずつ）
      // 内部でも /v2/fins/summary を多数呼ぶので、外側で並列にすると 429 連発
      const results: {
        date: string;
        earnings: EarningsData[];
        source: string;
        warning?: string;
        incompleteCodes?: string[];
      }[] = [];
      for (const date of dates) {
        let result: {
          earnings: EarningsData[];
          source: string;
          warning?: string;
          incompleteCodes?: string[];
        };
        if (!forceRefresh) {
          const cached = clientCache.current.get(`${date}:${source}`);
          if (cached) {
            const maxAge = date < today ? 7 * 24 * 60 * 60 * 1000 : 60 * 60 * 1000;
            if (Date.now() - cached.fetchedAt < maxAge) {
              result = {
                earnings: cached.earnings,
                source: cached.source,
                incompleteCodes: cached.incompleteCodes,
              };
              results.push({ date, ...result });
              const allSoFar = results.flatMap((r) => r.earnings);
              setEarningsData(allSoFar);
              continue;
            }
          }
        }
        result = await fetchFromApi(date, source, apiKey, forceRefresh);
        clientCache.current.set(`${date}:${source}`, {
          earnings: result.earnings,
          source: result.source,
          fetchedAt: Date.now(),
          incompleteCodes: result.incompleteCodes,
        });
        results.push({ date, ...result });
        // 1 日完了ごとに途中結果を表示
        const allSoFar = results.flatMap((r) => r.earnings);
        setEarningsData(allSoFar);
      }
      const allData = results.flatMap((r) => r.earnings);
      const lastWarning = results.find((r) => r.warning)?.warning;
      setEarningsData(allData);
      setActiveSource(results[0]?.source || 'unknown');
      if (lastWarning) setWarning(lastWarning);

      // 全日完了後にバックグラウンド refill ループを起動
      const refillJobs: { date: string; code: string }[] = [];
      for (const r of results) {
        if (r.incompleteCodes?.length) {
          for (const c of r.incompleteCodes) refillJobs.push({ date: r.date, code: c });
        }
      }
      if (refillJobs.length > 0 && source !== 'mock' && apiKey) {
        runRefillLoop(refillJobs, apiKey);
      }
    } catch (err) {
      console.error('Earnings fetch error:', err);
      // レート制限は一時的・再試行で解決可能。
      // 表示中データを mock で書き換えると投資判断にノイズを混ぜることになるため、
      // 既存表示は残して別UIで「自動再試行までの残り秒数」を伝える。
      if (err instanceof RateLimitError) {
        const retryAt = Date.now() + err.retryAfter * 1000;
        setRateLimit({ retryAt, message: err.message });
        setError(null);
        setWarning(null);
      } else {
        setError(err instanceof Error ? err.message : String(err));
        const mockData = mockEarningsData
          .filter((d) => d.date >= from && d.date <= to)
          .map((d) => ({ ...d, dataSource: 'mock' as const }));
        setEarningsData(mockData);
        setActiveSource('mock');
      }
    } finally {
      setLoading(false);
    }
  }, [fetchFromApi, getDatesInRange, runRefillLoop]);

  // レート制限のカウントダウン用 1 秒タイマー（rateLimit が立っている間のみ動く）
  useEffect(() => {
    if (!rateLimit) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [rateLimit]);

  // レート制限の retry 時刻に到達したら自動再試行
  useEffect(() => {
    if (!rateLimit) return;
    if (now < rateLimit.retryAt) return;
    setRateLimit(null);
    fetchEarningsRange(dateFrom, dateTo, dataSource, jquantsApiKey, true);
  }, [now, rateLimit, dateFrom, dateTo, dataSource, jquantsApiKey, fetchEarningsRange]);

  // NOTE: 1週間プリフェッチはレート制限上の負荷が大きすぎるため廃止。
  // J-Quants V2 は秒あたりのリクエスト上限が厳しく、7日分を並列に投機取得すると
  // 内部の /v2/fins/summary 呼び出しが束になって 429 を連発させる。
  // サーバ側 30 日キャッシュがあるので、ユーザが日付を切り替えた時の取得で十分賄える。

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
          selectedExchanges: Array.from(selectedExchanges),
          selectedMarkets: Array.from(selectedMarkets),
          marketCapMin,
          marketCapMax,
          quickFilter,
        }),
      );
    } catch {
      // localStorage使用不可
    }
  }, [listedOnly, favoritesOnly, selectedExchanges, selectedMarkets, marketCapMin, marketCapMax, quickFilter, filtersLoaded]);

  // サプライズ閾値変更時に localStorage へ保存
  useEffect(() => {
    if (!filtersLoaded) return;
    try {
      localStorage.setItem(SURPRISE_THRESHOLD_STORAGE, String(surpriseThreshold));
    } catch {
      // localStorage使用不可
    }
  }, [surpriseThreshold, filtersLoaded]);

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
    fetchEarningsRange(dateFrom, dateTo, dataSource, jquantsApiKey);
  }, [dateFrom, dateTo, dataSource, jquantsApiKey, fetchEarningsRange, filtersLoaded]);

  // 日付変更検知（0時を跨いだら当日分のクライアントキャッシュを破棄）
  // 当日データの再取得は、ユーザがその日付を選択したタイミングで自動的に走る。
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
      }
    };
    const interval = setInterval(checkDateChange, 30000);
    return () => clearInterval(interval);
  }, []);

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
      // 種別フィルター（J-Quants /fins/statements で取得できる種類のみ）
      if (item.type === '決算' && !filters.決算短信) return false;
      if (item.type === '四半期' && !filters.四半期) return false;
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

      // 上場場所（取引所）フィルタ
      if (selectedExchanges.size > 0) {
        if (!stock) return false;
        if (!selectedExchanges.has(getExchange(stock.market))) return false;
      }

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
    selectedExchanges,
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
      case '四半期':
        return <span className="inline-block px-1.5 py-0.5 rounded text-xs font-medium bg-cyan-500/20 text-cyan-400 whitespace-nowrap">四半期</span>;
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
    if (source === 'tdnet') return <span className="inline-block px-1.5 py-0.5 rounded text-xs font-medium bg-green-500/20 text-green-400">TDnet</span>;
    if (source === 'mock') return <span className="inline-block px-1.5 py-0.5 rounded text-xs font-medium bg-gray-500/20 text-gray-400">MOCK</span>;
    return null;
  };

  const sortableThClass = 'px-3 py-2 text-left text-xs font-medium uppercase cursor-pointer hover:bg-gray-600 select-none';

  // kind: 'qq' = 前四半期比, 'yy' = 前年同期比, 'con' = コンセンサス比（未接続）
  const numericColumns: { key: string; label: string; kind: 'qq' | 'yy' | 'con' }[] = [
    { key: 'salesQQ', label: '売QQ', kind: 'qq' },
    { key: 'operatingProfitQQ', label: '営QQ', kind: 'qq' },
    { key: 'ordinaryProfitQQ', label: '経QQ', kind: 'qq' },
    { key: 'netProfitQQ', label: '利QQ', kind: 'qq' },
    { key: 'salesYY', label: '売YY', kind: 'yy' },
    { key: 'operatingProfitYY', label: '営YY', kind: 'yy' },
    { key: 'ordinaryProfitYY', label: '経YY', kind: 'yy' },
    { key: 'netProfitYY', label: '利YY', kind: 'yy' },
    { key: 'salesCon', label: '売Con', kind: 'con' },
    { key: 'operatingProfitCon', label: '営Con', kind: 'con' },
    { key: 'ordinaryProfitCon', label: '経Con', kind: 'con' },
    { key: 'netProfitCon', label: '利Con', kind: 'con' },
  ];

  // YoY 欠損バッジを表示すべきタイプ（決算ドキュメントで前期比較が期待される種別）
  const expectsYoY = (type: string): boolean =>
    type === '決算' || type === '四半期';

  const disabledThClass = 'px-3 py-2 text-left text-xs font-medium uppercase text-gray-500 cursor-not-allowed select-none';
  const CON_UNAVAILABLE_TITLE = 'コンセンサス値は未接続です';

  // 種別ごとの件数
  const typeCounts = useMemo(() => {
    const counts = { 決算: 0, 四半期: 0, 業績修正: 0, 配当修正: 0 };
    for (const item of earningsData) {
      if (item.type === '決算') counts.決算++;
      else if (item.type === '四半期') counts.四半期++;
      else if (item.type === '業績修正') counts.業績修正++;
      else if (item.type === '配当修正') counts.配当修正++;
    }
    return counts;
  }, [earningsData]);

  const filterKeyToType: Record<string, keyof typeof typeCounts> = {
    決算短信: '決算',
    四半期: '四半期',
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

  // YoY 抽出成功率: 決算・四半期 のうち、4つの YoY のうち少なくとも 1つが非 null の件数
  // J-Quants で前年同期 statement が引き当てられなかったケースの可視化
  const yoyStats = useMemo(() => {
    let expected = 0;
    let extracted = 0;
    for (const item of earningsData) {
      if (item.type !== '決算' && item.type !== '四半期') continue;
      expected++;
      if (
        item.salesYY != null ||
        item.operatingProfitYY != null ||
        item.ordinaryProfitYY != null ||
        item.netProfitYY != null
      ) {
        extracted++;
      }
    }
    const rate = expected > 0 ? Math.round((extracted / expected) * 100) : 0;
    return { expected, extracted, rate };
  }, [earningsData]);

  // QQ 抽出成功率: 決算・四半期 のうち、4つの QQ のうち少なくとも 1つが非 null の件数
  // QQ は構造的に欠けやすい (1Q なら前FY末データが必要、2Q+ なら同FY内の前Qが必要、
  // 履歴フェッチがタイムアウトすると軒並み null になる)。
  const qqStats = useMemo(() => {
    let expected = 0;
    let extracted = 0;
    for (const item of earningsData) {
      if (item.type !== '決算' && item.type !== '四半期') continue;
      expected++;
      if (
        item.salesQQ != null ||
        item.operatingProfitQQ != null ||
        item.ordinaryProfitQQ != null ||
        item.netProfitQQ != null
      ) {
        extracted++;
      }
    }
    const rate = expected > 0 ? Math.round((extracted / expected) * 100) : 0;
    return { expected, extracted, rate };
  }, [earningsData]);

  // 選択銘柄の決算履歴を取得（過去 8 四半期推移）
  useEffect(() => {
    if (!selectedCompany) {
      setHistoryData(null);
      setHistoryError(null);
      setHistoryLoading(false);
      return;
    }
    const code = selectedCompany.code;
    const source = selectedCompany.dataSource === 'mock' || dataSource === 'mock' ? 'mock' : 'tdnet';
    if (source === 'tdnet' && !jquantsApiKey) {
      setHistoryData(null);
      setHistoryError('J-Quants APIキー未設定のため履歴を取得できません');
      setHistoryLoading(false);
      return;
    }
    let cancelled = false;
    setHistoryLoading(true);
    setHistoryError(null);
    setHistoryData(null);
    const headers: Record<string, string> = {};
    if (source === 'tdnet') headers['x-jquants-api-key'] = jquantsApiKey;
    fetch(`/api/earnings/history?code=${code}&source=${source}`, { headers })
      .then(async (res) => {
        const ct = res.headers.get('content-type') || '';
        if (!ct.includes('application/json')) {
          const text = await res.text();
          const isTimeout = /FUNCTION_INVOCATION_TIMEOUT/i.test(text);
          throw new Error(
            isTimeout
              ? '履歴取得がサーバ側でタイムアウトしました。もう一度開くとキャッシュで段階的に取得されます。'
              : `サーバから JSON 以外が返されました (HTTP ${res.status})`,
          );
        }
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        return data as CompanyHistoryResponse;
      })
      .then((data) => {
        if (!cancelled) setHistoryData(data);
      })
      .catch((e) => {
        if (!cancelled) setHistoryError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedCompany, jquantsApiKey, dataSource]);

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

  // サプライズ判定: 決算・四半期で、営業利益 or 純利益の YoY 絶対値が閾値以上なら「要チェック」
  // コンセンサス値は未接続のため、自社前年同期比での閾値判定
  const isSurprise = useCallback((item: EarningsData): boolean => {
    if (item.type !== '決算' && item.type !== '四半期') return false;
    const op = item.operatingProfitYY;
    const np = item.netProfitYY;
    return (
      (op != null && Math.abs(op) >= surpriseThreshold) ||
      (np != null && Math.abs(np) >= surpriseThreshold)
    );
  }, [surpriseThreshold]);

  // ⚡ アイコンの tooltip 用: YoY の生値を表示
  const surpriseTitle = (item: EarningsData): string => {
    const op = item.operatingProfitYY;
    const np = item.netProfitYY;
    const parts: string[] = [];
    if (op != null) parts.push(`営業利益YoY ${formatPercent(op)}`);
    if (np != null) parts.push(`純利益YoY ${formatPercent(np)}`);
    return parts.length > 0 ? `サプライズ (閾値 ±${surpriseThreshold}%): ${parts.join(' / ')}` : 'サプライズ';
  };

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
        salesQQ: d.salesQQ ?? '',
        operatingProfitQQ: d.operatingProfitQQ ?? '',
        ordinaryProfitQQ: d.ordinaryProfitQQ ?? '',
        netProfitQQ: d.netProfitQQ ?? '',
        salesYY: d.salesYY ?? '',
        operatingProfitYY: d.operatingProfitYY ?? '',
        ordinaryProfitYY: d.ordinaryProfitYY ?? '',
        netProfitYY: d.netProfitYY ?? '',
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

  // 上場場所のトグル
  const toggleExchange = (exchange: string) => {
    setSelectedExchanges((prev) => {
      const next = new Set(prev);
      if (next.has(exchange)) next.delete(exchange);
      else next.add(exchange);
      return next;
    });
  };

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
    setSelectedExchanges(new Set());
    setSelectedMarkets(new Set());
    setMarketCapMin('');
    setMarketCapMax('');
    setQuickFilter('all');
  };

  const advFilterActiveCount =
    (favoritesOnly ? 1 : 0) +
    (selectedExchanges.size > 0 ? 1 : 0) +
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
                onClick={() => fetchEarningsRange(dateFrom, dateTo, dataSource, jquantsApiKey, true)}
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
              <option value="auto">自動（TDnet優先）</option>
              <option value="tdnet">TDnet（J-Quants）</option>
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
                {/* 上場場所（取引所） */}
                {availableExchanges.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-gray-400 mr-1">上場場所:</span>
                    {availableExchanges.map((ex) => (
                      <button
                        key={ex}
                        type="button"
                        onClick={() => toggleExchange(ex)}
                        className={`px-2 py-0.5 rounded text-xs border transition-colors ${
                          selectedExchanges.has(ex)
                            ? 'bg-blue-600 border-blue-500 text-white'
                            : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600'
                        }`}
                      >
                        {ex}
                      </button>
                    ))}
                    {selectedExchanges.size > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedExchanges(new Set())}
                        className="text-xs text-gray-400 hover:text-white ml-1"
                      >
                        ✕ クリア
                      </button>
                    )}
                  </div>
                )}
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
                {/* サプライズ閾値（⚡ハイライト発火の YoY 絶対値%） */}
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="text-gray-400">サプライズ閾値:</span>
                  <span className="text-gray-500">YoY ±</span>
                  <input
                    type="number"
                    min={0}
                    max={500}
                    step={5}
                    value={surpriseThreshold}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (Number.isFinite(n) && n >= 0) setSurpriseThreshold(n);
                    }}
                    className="w-16 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white"
                  />
                  <span className="text-gray-500">%</span>
                  <span className="text-gray-600 ml-2">
                    決算・四半期で営業利益 or 純利益の YoY 絶対値が閾値以上の銘柄に ⚡ を表示
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* 伸び率ソートプリセット（時短の本丸：1クリックで「伸びた順／崩れた順」） */}
          {earningsData.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mb-3">
              <span className="text-xs text-gray-400 mr-1">並び替え:</span>
              {[
                { key: 'operatingProfitYY', dir: 'desc' as const, label: '営業利益 伸びた順', icon: '📈' },
                { key: 'operatingProfitYY', dir: 'asc' as const, label: '営業利益 崩れた順', icon: '📉' },
                { key: 'netProfitYY', dir: 'desc' as const, label: '純利益 伸びた順', icon: '💰' },
                { key: 'salesYY', dir: 'desc' as const, label: '売上 伸びた順', icon: '🛒' },
              ].map((preset) => {
                const active = sortConfig?.key === preset.key && sortConfig?.direction === preset.dir;
                return (
                  <button
                    key={`${preset.key}-${preset.dir}`}
                    type="button"
                    onClick={() => setSortConfig({ key: preset.key, direction: preset.dir })}
                    className={`px-2.5 py-1 rounded text-xs whitespace-nowrap transition-colors ${
                      active
                        ? 'bg-blue-600 text-white ring-1 ring-blue-400'
                        : 'bg-gray-700 hover:bg-gray-600 text-gray-200'
                    }`}
                    title={`${preset.label}（${preset.key} ${preset.dir === 'desc' ? '降順' : '昇順'}）`}
                  >
                    <span className="mr-0.5">{preset.icon}</span>
                    {preset.label}
                  </button>
                );
              })}
              {sortConfig && (
                <button
                  type="button"
                  onClick={() => setSortConfig(null)}
                  className="px-2 py-1 rounded text-xs bg-gray-800 border border-gray-700 text-gray-400 hover:text-white"
                  title="ソート解除"
                >
                  ✕ 解除
                </button>
              )}
              {/* YoY 抽出成功率 */}
              {yoyStats.expected > 0 && (
                <span
                  className={`ml-auto px-2 py-1 rounded text-xs whitespace-nowrap ${
                    yoyStats.rate >= 70
                      ? 'bg-green-500/15 text-green-400'
                      : yoyStats.rate >= 40
                        ? 'bg-yellow-500/15 text-yellow-400'
                        : 'bg-orange-500/15 text-orange-400'
                  }`}
                  title={`決算・四半期 ${yoyStats.expected}件のうち、YoY を少なくとも 1つ抽出できた件数。低い場合は前年同期 statement が J-Quants 履歴内に見つからなかった可能性があります。`}
                >
                  YoY抽出 {yoyStats.extracted}/{yoyStats.expected}件 ({yoyStats.rate}%)
                </span>
              )}
              {/* QQ 抽出成功率: 1Q は前FY末、2Q+は同FY内前Qの履歴が必要なため YoY より欠落しやすい */}
              {qqStats.expected > 0 && (
                <span
                  className={`px-2 py-1 rounded text-xs whitespace-nowrap ${
                    qqStats.rate >= 70
                      ? 'bg-green-500/15 text-green-400'
                      : qqStats.rate >= 40
                        ? 'bg-yellow-500/15 text-yellow-400'
                        : 'bg-orange-500/15 text-orange-400'
                  }`}
                  title={`決算・四半期 ${qqStats.expected}件のうち、QQ (前四半期比) を少なくとも 1つ抽出できた件数。低い場合は同FY内の直前四半期 statement (1Q なら前FY末) が J-Quants 履歴内に見つからない、もしくは履歴フェッチが Vercel 60 秒タイムアウトに到達した可能性があります。同じ日付を再度開くとサーバ側 30 日キャッシュに少しずつ蓄積され、徐々に埋まります。`}
                >
                  QQ抽出 {qqStats.extracted}/{qqStats.expected}件 ({qqStats.rate}%)
                </span>
              )}
            </div>
          )}

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

          {/* レート制限カウントダウン: 既存表示はそのまま、再試行までの待機をはっきり伝える */}
          {rateLimit && (
            <div className="bg-amber-900/30 border border-amber-600/50 rounded-lg px-4 py-3 mb-4 text-sm text-amber-200 flex flex-wrap items-center gap-3">
              <span className="font-medium">
                ⏳ J-Quants レート制限中（自動で再試行します）
              </span>
              <span className="text-amber-300">
                残り {Math.max(0, Math.ceil((rateLimit.retryAt - now) / 1000))} 秒
              </span>
              <button
                onClick={() => {
                  setRateLimit(null);
                  fetchEarningsRange(dateFrom, dateTo, dataSource, jquantsApiKey, true);
                }}
                className="ml-auto px-3 py-1 bg-amber-600/40 hover:bg-amber-600/60 rounded text-xs"
              >
                今すぐ再試行
              </button>
            </div>
          )}

          {/* バックグラウンド補完進捗: incompleteCodes を 1 銘柄ずつ refill 中 */}
          {refillProgress && refillProgress.total > 0 && (
            <div className="bg-blue-900/20 border border-blue-600/40 rounded-lg px-4 py-2 mb-4 text-sm text-blue-200 flex flex-wrap items-center gap-3">
              <span className="inline-block h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
              <span>
                YoY を補完中: {refillProgress.done} / {refillProgress.total} 銘柄
              </span>
              <div className="flex-1 min-w-[120px] h-1.5 bg-blue-900/40 rounded overflow-hidden">
                <div
                  className="h-full bg-blue-400 transition-all"
                  style={{ width: `${(refillProgress.done / refillProgress.total) * 100}%` }}
                />
              </div>
              <span className="text-xs text-blue-300/80">完了次第テーブルに反映されます</span>
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
          {!jquantsApiKey && dataSource !== 'mock' && (
            <div className="bg-blue-900/30 border border-blue-600/50 rounded-lg px-4 py-3 mb-4">
              <p className="text-sm text-blue-300 mb-1">
                J-Quants APIキー（TDnet 決算短信）を設定すると、決算データの実データを表示できます。
              </p>
              <p className="text-xs text-blue-400">
                <a href="/settings" className="underline hover:text-blue-200">設定ページ</a>で
                J-Quants マイページのAPIキーを登録してください（/fins/statements は Standard プラン以上が必要）。
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
                      {numericColumns.map((col) => {
                        if (col.kind === 'con') {
                          return (
                            <th key={col.key} className={disabledThClass} title={CON_UNAVAILABLE_TITLE}>
                              {col.label}
                              <span className="ml-1 text-[9px] text-gray-500">未接続</span>
                            </th>
                          );
                        }
                        return (
                          <th key={col.key} onClick={() => handleSort(col.key)} className={sortableThClass}>
                            {col.label}{sortIcon(col.key)}
                          </th>
                        );
                      })}
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
                            {surprise && <span className="text-yellow-300 mr-1" title={surpriseTitle(data)}>⚡</span>}
                            <span className="text-gray-400">{data.code}</span>{' '}
                            <span>{data.companyName || stock?.name || '(社名未取得)'}</span>
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
                            if (col.kind === 'con') {
                              return (
                                <td key={col.key} className="px-3 py-2 text-gray-600" title={CON_UNAVAILABLE_TITLE}>
                                  —
                                </td>
                              );
                            }
                            const val = data[col.key as keyof EarningsData] as number | null;
                            if (val !== null && val !== undefined) {
                              return (
                                <td key={col.key} className="px-3 py-2">
                                  <span className={val >= 0 ? 'text-green-400' : 'text-red-400'}>
                                    {formatPercent(val)}
                                  </span>
                                </td>
                              );
                            }
                            // null の場合: YoY で期待される種別はバッジ付き
                            const showBadge = col.kind === 'yy' && expectsYoY(data.type);
                            return (
                              <td key={col.key} className="px-3 py-2">
                                {showBadge ? (
                                  <span
                                    className="text-gray-500 text-xs"
                                    title="前期比較データが書類に含まれていません"
                                  >
                                    N/A
                                  </span>
                                ) : (
                                  <span className="text-gray-600">-</span>
                                )}
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
                        {surprise && <span className="text-yellow-300 text-xs" title={surpriseTitle(data)}>⚡</span>}
                        <span className="text-gray-400 text-xs">{data.code}</span>
                        <span className="text-sm font-medium truncate">{data.companyName || stock?.name || '(社名未取得)'}</span>
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
                      ].map((col) => {
                        const hasVal = col.val !== null && col.val !== undefined;
                        const showBadge = !hasVal && expectsYoY(data.type);
                        return (
                          <div key={col.label} className="text-center">
                            <div className="text-gray-500">{col.label}</div>
                            {hasVal ? (
                              <div className={col.val! >= 0 ? 'text-green-400 font-medium' : 'text-red-400 font-medium'}>
                                {formatPercent(col.val!)}
                              </div>
                            ) : showBadge ? (
                              <div className="text-gray-500" title="前期比較データが書類に含まれていません">N/A</div>
                            ) : (
                              <div className="text-gray-600">-</div>
                            )}
                          </div>
                        );
                      })}
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
          <div className="space-y-4 sm:space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            <div className="bg-gray-800 rounded-lg p-4 sm:p-6">
              <div className="flex items-start justify-between gap-2 mb-4">
                <div className="flex items-center gap-2 flex-wrap">
                  {getTypeBadge(selectedCompany.type, selectedCompany.salesYY)}
                  <h2 className="text-lg sm:text-xl font-bold">
                    {selectedCompany.code} {selectedCompany.companyName || stockMap.get(selectedCompany.code)?.name || '(社名未取得)'}
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
                {selectedCompany.disclosureType && (
                  <div className="bg-gray-700/50 rounded p-3 text-sm">
                    <span className="text-gray-400">書類: </span>
                    <span>{selectedCompany.disclosureType}</span>
                    {selectedCompany.disclosureNumber && (
                      <span className="text-gray-500 ml-2 text-xs">#{selectedCompany.disclosureNumber}</span>
                    )}
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
                    ].map((row) => {
                      const yyMissingBadge = (row.yy === null || row.yy === undefined) && expectsYoY(selectedCompany.type);
                      return (
                        <div key={row.label} className="flex justify-between items-center">
                          <span className="text-gray-400">{row.label}</span>
                          <div className="flex gap-4">
                            <span className="w-20 text-right">
                              {row.yy !== null && row.yy !== undefined ? (
                                <span className={row.yy >= 0 ? 'text-green-400' : 'text-red-400'}>{formatPercent(row.yy)}</span>
                              ) : yyMissingBadge ? (
                                <span className="text-gray-500 text-xs" title="前期比較データが書類に含まれていません">N/A</span>
                              ) : <span className="text-gray-600">-</span>}
                            </span>
                            <span className="w-20 text-right">
                              {row.qq !== null && row.qq !== undefined ? (
                                <span className={row.qq >= 0 ? 'text-green-400' : 'text-red-400'}>{formatPercent(row.qq)}</span>
                              ) : <span className="text-gray-600">-</span>}
                            </span>
                          </div>
                        </div>
                      );
                    })}
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
                    {selectedCompany.disclosureType && (
                      <div><span className="text-gray-400">書類種別: </span>{selectedCompany.disclosureType}</div>
                    )}
                    {selectedCompany.disclosureNumber && (
                      <div><span className="text-gray-400">開示番号: </span>{selectedCompany.disclosureNumber}</div>
                    )}
                    {selectedCompany.periodEnd && (
                      <div><span className="text-gray-400">当期末日: </span>{selectedCompany.periodEnd}</div>
                    )}
                    <div><span className="text-gray-400">開示日時: </span>{selectedCompany.date} {selectedCompany.time}</div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 四半期推移カード（過去 8 四半期）*/}
          <HistoryCard
            loading={historyLoading}
            error={historyError}
            data={historyData}
            code={selectedCompany.code}
            companyName={selectedCompany.companyName || stockMap.get(selectedCompany.code)?.name || ''}
          />
          </div>
        )}
      </div>
    </div>
  );
}

// ========== 四半期推移カード ==========

function HistoryCard({
  loading,
  error,
  data,
  code,
  companyName,
}: {
  loading: boolean;
  error: string | null;
  data: CompanyHistoryResponse | null;
  code: string;
  companyName: string;
}) {
  // 金額フォーマット: 億円単位（J-Quants statements は円単位で返る）
  const toOku = (v: number | null | undefined): string => {
    if (v == null || !Number.isFinite(v)) return '-';
    const oku = v / 100_000_000;
    if (Math.abs(oku) >= 1000) return `${(oku / 1000).toFixed(1)}千億`;
    if (Math.abs(oku) >= 1) return `${oku.toFixed(0)}億`;
    return `${(oku * 10).toFixed(1)}千万`;
  };

  // 期末日の表示整形: YYYY-MM-DD → YYYY/MM
  const fmtPeriod = (s: string): string => {
    if (!s) return '-';
    const [y, m] = s.split('-');
    return y && m ? `${y.slice(2)}年${parseInt(m, 10)}月期` : s;
  };

  // 棒グラフの最大値（営業利益絶対値の最大）
  const maxOp = data && data.history.length > 0
    ? Math.max(1, ...data.history.map((h) => Math.abs(h.opProfitCum ?? 0)))
    : 1;

  return (
    <div className="bg-gray-800 rounded-lg p-4 sm:p-6">
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <h2 className="text-lg sm:text-xl font-bold">
          四半期推移 <span className="text-sm text-gray-400 font-normal">{code} {companyName}</span>
        </h2>
        {data && (
          <span className="text-xs text-gray-500">
            取得 {data.matchedDocs}件 / 表示 {data.history.length}期
            <span className={`ml-2 px-1.5 py-0.5 rounded ${
              data.source === 'tdnet' ? 'bg-green-500/15 text-green-400' : 'bg-gray-500/15 text-gray-400'
            }`}>{data.source.toUpperCase()}</span>
          </span>
        )}
      </div>

      {loading && (
        <div className="flex items-center gap-3 py-6 text-gray-400 text-sm">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-400" />
          過去 8 四半期の決算短信を J-Quants から取得中...
        </div>
      )}

      {!loading && error && (
        <div className="py-4 text-sm text-yellow-300 bg-yellow-900/20 rounded px-3">
          履歴取得エラー: {error}
        </div>
      )}

      {!loading && !error && data && data.history.length === 0 && (
        <div className="py-4 text-sm text-gray-400">
          過去 8 四半期で該当書類が見つかりませんでした。
          {data.source === 'mock' && '（モックデータには履歴がありません）'}
        </div>
      )}

      {!loading && !error && data && data.history.length > 0 && (
        <>
          {/* 棒グラフ: 営業利益（絶対値バー + 正負の色） */}
          <div className="mb-4">
            <div className="text-xs text-gray-500 mb-1">営業利益（累計、単位: 億円）</div>
            <div className="space-y-1">
              {data.history.map((h, i) => {
                const opOku = h.opProfitCum != null ? h.opProfitCum / 100_000_000 : null;
                const barPct = h.opProfitCum != null ? Math.min(100, (Math.abs(h.opProfitCum) / maxOp) * 100) : 0;
                const isNeg = (h.opProfitCum ?? 0) < 0;
                return (
                  <div key={`${h.disclosureNumber}-${i}`} className="flex items-center gap-2 text-xs">
                    <span className="w-20 shrink-0 text-gray-400">{fmtPeriod(h.periodEnd || h.filingDate)}</span>
                    <div className="flex-1 bg-gray-900 rounded h-4 relative overflow-hidden">
                      <div
                        className={`h-full ${isNeg ? 'bg-red-500/60' : 'bg-green-500/60'}`}
                        style={{ width: `${barPct}%` }}
                      />
                    </div>
                    <span className={`w-16 text-right shrink-0 ${isNeg ? 'text-red-400' : 'text-green-400'}`}>
                      {opOku != null ? `${opOku.toFixed(0)}億` : '-'}
                    </span>
                    <span className="w-16 text-right shrink-0 text-gray-400">
                      {h.opYY != null ? (
                        <span className={h.opYY >= 0 ? 'text-green-400' : 'text-red-400'}>
                          YoY{h.opYY >= 0 ? '+' : ''}{h.opYY.toFixed(1)}%
                        </span>
                      ) : '-'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* テーブル: 3指標 × YoY */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-700/50">
                <tr>
                  <th className="px-2 py-1.5 text-left font-medium">決算期</th>
                  <th className="px-2 py-1.5 text-left font-medium">種別</th>
                  <th className="px-2 py-1.5 text-right font-medium">売上</th>
                  <th className="px-2 py-1.5 text-right font-medium">売YoY</th>
                  <th className="px-2 py-1.5 text-right font-medium">営業利益</th>
                  <th className="px-2 py-1.5 text-right font-medium">営YoY</th>
                  <th className="px-2 py-1.5 text-right font-medium">純利益</th>
                  <th className="px-2 py-1.5 text-right font-medium">純YoY</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {[...data.history].reverse().map((h, i) => {
                  const yyCell = (v: number | null) =>
                    v != null ? (
                      <span className={v >= 0 ? 'text-green-400' : 'text-red-400'}>
                        {v >= 0 ? '+' : ''}{v.toFixed(1)}%
                      </span>
                    ) : <span className="text-gray-600">-</span>;
                  return (
                    <tr key={`t-${h.disclosureNumber}-${i}`} className="hover:bg-gray-700/30">
                      <td className="px-2 py-1.5 whitespace-nowrap">{fmtPeriod(h.periodEnd || h.filingDate)}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap text-gray-400">{h.type}</td>
                      <td className="px-2 py-1.5 text-right whitespace-nowrap">{toOku(h.salesCum)}</td>
                      <td className="px-2 py-1.5 text-right whitespace-nowrap">{yyCell(h.salesYY)}</td>
                      <td className="px-2 py-1.5 text-right whitespace-nowrap">{toOku(h.opProfitCum)}</td>
                      <td className="px-2 py-1.5 text-right whitespace-nowrap">{yyCell(h.opYY)}</td>
                      <td className="px-2 py-1.5 text-right whitespace-nowrap">{toOku(h.netProfitCum)}</td>
                      <td className="px-2 py-1.5 text-right whitespace-nowrap">{yyCell(h.netYY)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 通期計画（もし抽出できていれば、最新行のみ表示）*/}
          {(() => {
            const latest = data.history[data.history.length - 1];
            const hasForecast =
              latest.salesForecast != null ||
              latest.opProfitForecast != null ||
              latest.netProfitForecast != null;
            if (!hasForecast) return null;
            // 進捗率 = 当期累計 / 通期計画
            const progress = (cum: number | null, fcast: number | null | undefined): string => {
              if (cum == null || fcast == null || fcast === 0) return '';
              return `（進捗 ${((cum / fcast) * 100).toFixed(0)}%）`;
            };
            return (
              <div className="mt-4 pt-3 border-t border-gray-700">
                <div className="text-xs text-gray-400 mb-1">通期計画（会社予想）— {fmtPeriod(latest.periodEnd || latest.filingDate)}</div>
                <div className="flex flex-wrap gap-4 text-xs">
                  {latest.salesForecast != null && (
                    <span>売上 <span className="text-gray-200">{toOku(latest.salesForecast)}</span> <span className="text-gray-500">{progress(latest.salesCum, latest.salesForecast)}</span></span>
                  )}
                  {latest.opProfitForecast != null && (
                    <span>営業利益 <span className="text-gray-200">{toOku(latest.opProfitForecast)}</span> <span className="text-gray-500">{progress(latest.opProfitCum, latest.opProfitForecast)}</span></span>
                  )}
                  {latest.netProfitForecast != null && (
                    <span>純利益 <span className="text-gray-200">{toOku(latest.netProfitForecast)}</span> <span className="text-gray-500">{progress(latest.netProfitCum, latest.netProfitForecast)}</span></span>
                  )}
                </div>
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}

