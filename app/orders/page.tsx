'use client';

import { useState, useMemo } from 'react';
import { OrderData } from '@/lib/types/financial';
import { formatPercent } from '@/lib/utils/format';

type SortConfig = { key: string; direction: 'asc' | 'desc' } | null;

// モックデータの最新日付（state 初期化用）。mockOrderData 定義より後で計算するため lazy init を使う
function getLatestMockDate(data: OrderData[]): string {
  const dates = [...new Set(data.map((d) => d.date))].sort();
  return dates[dates.length - 1] || new Date().toISOString().split('T')[0];
}

// モックデータ（複数日に分散）
const mockOrderData: OrderData[] = [
  // 2026-02-10
  {
    date: '2026-02-10',
    code: '1414',
    companyName: 'ショーボンドホールディングス',
    quarter: '2Q',
    orderValue: 21,
    orderYoY: null,
    orderQoQ: null,
    outstandingOrders: 28,
    outstandingYoY: null,
    outstandingQoQ: null,
  },
  {
    date: '2026-02-10',
    code: '1963',
    companyName: '日揮ホールディングス',
    quarter: '3Q',
    orderValue: 14046,
    orderYoY: 0.0,
    orderQoQ: null,
    outstandingOrders: 0,
    outstandingYoY: null,
    outstandingQoQ: null,
  },
  {
    date: '2026-02-10',
    code: '6384',
    companyName: '昭和真空',
    quarter: '3Q',
    orderValue: 45,
    orderYoY: 95.3,
    orderQoQ: null,
    outstandingOrders: 56,
    outstandingYoY: -3.6,
    outstandingQoQ: null,
  },
  {
    date: '2026-02-10',
    code: '7122',
    companyName: '近畿車輛',
    quarter: '3Q',
    orderValue: 291,
    orderYoY: 73.0,
    orderQoQ: 46.7,
    outstandingOrders: 1211,
    outstandingYoY: -0.1,
    outstandingQoQ: 0.7,
  },
  // 2026-02-07
  {
    date: '2026-02-07',
    code: '6302',
    companyName: '住友重機械工業',
    quarter: '4Q',
    orderValue: 11584,
    orderYoY: 23.8,
    orderQoQ: 145.0,
    outstandingOrders: 0,
    outstandingYoY: null,
    outstandingQoQ: null,
  },
  {
    date: '2026-02-07',
    code: '6466',
    companyName: 'TVE',
    quarter: '1Q',
    orderValue: 27,
    orderYoY: -6.1,
    orderQoQ: -80.0,
    outstandingOrders: 72,
    outstandingYoY: -0.8,
    outstandingQoQ: null,
  },
  {
    date: '2026-02-07',
    code: '1866',
    companyName: '北野建設',
    quarter: '3Q',
    orderValue: 452,
    orderYoY: -46.0,
    orderQoQ: null,
    outstandingOrders: 851,
    outstandingYoY: -13.1,
    outstandingQoQ: null,
  },
  // 2026-01-31
  {
    date: '2026-01-31',
    code: '6301',
    companyName: 'コマツ',
    quarter: '3Q',
    orderValue: 9850,
    orderYoY: 8.5,
    orderQoQ: 12.3,
    outstandingOrders: 18500,
    outstandingYoY: 5.2,
    outstandingQoQ: 2.8,
  },
  {
    date: '2026-01-31',
    code: '7011',
    companyName: '三菱重工業',
    quarter: '3Q',
    orderValue: 18200,
    orderYoY: 15.2,
    orderQoQ: 8.7,
    outstandingOrders: 52000,
    outstandingYoY: 12.8,
    outstandingQoQ: 3.5,
  },
  {
    date: '2026-01-31',
    code: '6305',
    companyName: '日立建機',
    quarter: '3Q',
    orderValue: 3200,
    orderYoY: -5.8,
    orderQoQ: -12.5,
    outstandingOrders: 8500,
    outstandingYoY: -3.2,
    outstandingQoQ: -1.8,
  },
  // 2025-11-14
  {
    date: '2025-11-14',
    code: '1801',
    companyName: '大成建設',
    quarter: '2Q',
    orderValue: 5800,
    orderYoY: 12.5,
    orderQoQ: 35.2,
    outstandingOrders: 22000,
    outstandingYoY: 8.5,
    outstandingQoQ: 4.2,
  },
  {
    date: '2025-11-14',
    code: '1802',
    companyName: '大林組',
    quarter: '2Q',
    orderValue: 6200,
    orderYoY: -3.5,
    orderQoQ: 18.8,
    outstandingOrders: 19500,
    outstandingYoY: 2.8,
    outstandingQoQ: 1.5,
  },
  {
    date: '2025-11-14',
    code: '1803',
    companyName: '清水建設',
    quarter: '2Q',
    orderValue: 5100,
    orderYoY: 8.2,
    orderQoQ: -5.8,
    outstandingOrders: 17800,
    outstandingYoY: 5.5,
    outstandingQoQ: 2.1,
  },
  // 2025-08-08
  {
    date: '2025-08-08',
    code: '7012',
    companyName: '川崎重工業',
    quarter: '1Q',
    orderValue: 4500,
    orderYoY: 22.5,
    orderQoQ: -15.2,
    outstandingOrders: 15800,
    outstandingYoY: 18.5,
    outstandingQoQ: 5.8,
  },
  {
    date: '2025-08-08',
    code: '6326',
    companyName: 'クボタ',
    quarter: '1Q',
    orderValue: 5200,
    orderYoY: -8.2,
    orderQoQ: -22.5,
    outstandingOrders: 12500,
    outstandingYoY: -2.5,
    outstandingQoQ: -5.2,
  },
];

export default function OrdersPage() {
  // モックデータの最新日付を初期値に。ハードコード '2026-02-10' だと将来的に古いデータが見えてしまうため
  const [selectedDate, setSelectedDate] = useState(() => getLatestMockDate(mockOrderData));
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);

  // データに含まれる日付一覧（ソート済み）
  const availableDates = useMemo(() => {
    return [...new Set(mockOrderData.map((d) => d.date))].sort();
  }, []);

  const latestAvailable = availableDates[availableDates.length - 1] || '';

  // 選択日付でフィルタ
  const filteredData = useMemo(() => {
    return mockOrderData.filter((item) => item.date === selectedDate);
  }, [selectedDate]);

  // ソート適用（null値は末尾）
  const sortedData = useMemo(() => {
    if (!sortConfig) return filteredData;
    return [...filteredData].sort((a, b) => {
      const aVal = a[sortConfig.key as keyof OrderData] as number | null;
      const bVal = b[sortConfig.key as keyof OrderData] as number | null;
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

  // データのある前の日付へ移動
  const goToPrevDate = () => {
    const idx = availableDates.indexOf(selectedDate);
    if (idx > 0) {
      setSelectedDate(availableDates[idx - 1]);
    } else if (idx === -1) {
      const prev = availableDates.filter((d) => d < selectedDate).pop();
      if (prev) setSelectedDate(prev);
    }
  };

  // データのある次の日付へ移動
  const goToNextDate = () => {
    const idx = availableDates.indexOf(selectedDate);
    if (idx >= 0 && idx < availableDates.length - 1) {
      setSelectedDate(availableDates[idx + 1]);
    } else if (idx === -1) {
      const next = availableDates.find((d) => d > selectedDate);
      if (next) setSelectedDate(next);
    }
  };

  // 今日の日付へ移動
  const goToToday = () => {
    const today = new Date().toISOString().split('T')[0];
    setSelectedDate(today);
  };

  const formatOrderValue = (value: number): string => {
    if (value >= 10000) {
      return `${(value / 10000).toFixed(2)}兆円`;
    }
    return `${value}億円`;
  };

  const sortableThClass = 'px-4 py-3 text-left text-xs font-medium uppercase cursor-pointer hover:bg-gray-600 select-none';

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* MOCK 警告バナー: 投資判断には使えないことを明示 */}
        <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded text-sm text-yellow-200">
          <strong className="font-medium">⚠ モックデータ表示中</strong>
          <span className="ml-2 text-yellow-100/80">
            受注データは実データ未接続です。表示中の数値はサンプルであり、投資判断に使用しないでください。
          </span>
        </div>

        {/* ヘッダー: モバイル対応のため flex-wrap */}
        <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            受注一覧
            <span className="inline-block px-1.5 py-0.5 rounded text-xs font-medium bg-gray-500/30 text-gray-300">MOCK</span>
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={goToPrevDate}
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm"
              title="データのある前の日付へ"
            >
              ◀ 前日
            </button>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-3 py-1 bg-gray-700 border border-gray-600 rounded text-sm text-white [color-scheme:dark]"
            />
            <button
              onClick={goToNextDate}
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm"
              title="データのある次の日付へ"
            >
              翌日 ▶
            </button>
            <button
              onClick={goToToday}
              className="px-3 py-1 bg-blue-600 hover:bg-blue-500 rounded text-sm"
            >
              今日
            </button>
            {latestAvailable && (
              <button
                onClick={() => setSelectedDate(latestAvailable)}
                className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm"
                title={`モック最新: ${latestAvailable}`}
              >
                最新データ
              </button>
            )}
            <span className="text-xs text-gray-400 ml-2">
              ({filteredData.length}件 / 全{availableDates.length}日分)
            </span>
          </div>
        </div>

        {/* テーブル */}
        <div className="bg-gray-800 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-700">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase">コード</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase">企業名</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase">四半期</th>
                  <th onClick={() => handleSort('orderValue')} className={sortableThClass}>
                    受注高{sortIcon('orderValue')}
                  </th>
                  <th onClick={() => handleSort('orderYoY')} className={sortableThClass}>
                    受注YoY{sortIcon('orderYoY')}
                  </th>
                  <th onClick={() => handleSort('orderQoQ')} className={sortableThClass}>
                    受注QoQ{sortIcon('orderQoQ')}
                  </th>
                  <th onClick={() => handleSort('outstandingOrders')} className={sortableThClass}>
                    受注残高{sortIcon('outstandingOrders')}
                  </th>
                  <th onClick={() => handleSort('outstandingYoY')} className={sortableThClass}>
                    残YOY{sortIcon('outstandingYoY')}
                  </th>
                  <th onClick={() => handleSort('outstandingQoQ')} className={sortableThClass}>
                    残QoQ{sortIcon('outstandingQoQ')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {sortedData.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-gray-400">
                      <div>この日付（{selectedDate}）にはモックデータがありません</div>
                      {latestAvailable && (
                        <button
                          onClick={() => setSelectedDate(latestAvailable)}
                          className="mt-3 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-sm text-white"
                        >
                          最新データの日付（{latestAvailable}）を表示
                        </button>
                      )}
                      <div className="mt-3 text-xs text-gray-500">
                        ※ 受注データは実データ未接続。本機能は今後 各社IRから実データを取り込む予定です。
                      </div>
                    </td>
                  </tr>
                ) : (
                  sortedData.map((order, index) => (
                    <tr key={index} className="hover:bg-gray-750">
                      <td className="px-4 py-3 text-sm">{order.code}</td>
                      <td className="px-4 py-3 text-sm">{order.companyName}</td>
                      <td className="px-4 py-3 text-sm">{order.quarter}</td>
                      <td className="px-4 py-3 text-sm">{formatOrderValue(order.orderValue)}</td>
                      <td className="px-4 py-3 text-sm">
                        {order.orderYoY !== null ? (
                          <span className={order.orderYoY >= 0 ? 'text-green-400' : 'text-red-400'}>
                            {formatPercent(order.orderYoY)}
                          </span>
                        ) : (
                          <span className="text-gray-500">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {order.orderQoQ !== null ? (
                          <span className={order.orderQoQ >= 0 ? 'text-green-400' : 'text-red-400'}>
                            {formatPercent(order.orderQoQ)}
                          </span>
                        ) : (
                          <span className="text-gray-500">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {order.outstandingOrders > 0 ? formatOrderValue(order.outstandingOrders) : '-'}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {order.outstandingYoY !== null ? (
                          <span className={order.outstandingYoY >= 0 ? 'text-green-400' : 'text-red-400'}>
                            {formatPercent(order.outstandingYoY)}
                          </span>
                        ) : (
                          <span className="text-gray-500">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {order.outstandingQoQ !== null ? (
                          <span className={order.outstandingQoQ >= 0 ? 'text-green-400' : 'text-red-400'}>
                            {formatPercent(order.outstandingQoQ)}
                          </span>
                        ) : (
                          <span className="text-gray-500">-</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
