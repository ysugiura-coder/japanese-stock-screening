'use client';

import { useState, useMemo } from 'react';
import { EarningsData } from '@/lib/types/financial';
import { mockEarningsData } from '@/lib/data/mock-earnings';
import { formatPercent } from '@/lib/utils/format';

type SortConfig = { key: string; direction: 'asc' | 'desc' } | null;

export default function EarningsPage() {
  const [selectedDate, setSelectedDate] = useState('2026-02-07');
  const [selectedCompany, setSelectedCompany] = useState<EarningsData | null>(null);
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);
  const [filters, setFilters] = useState({
    決算短信: true,
    業績修正: true,
    配当修正: false,
    決算資料: false,
    その他: false,
  });

  // データに含まれる日付一覧（ソート済み）
  const availableDates = useMemo(() => {
    const dates = [...new Set(mockEarningsData.map((d) => d.date))].sort();
    return dates;
  }, []);

  // 選択日付でフィルタ → 種別フィルタ
  const filteredData = useMemo(() => {
    return mockEarningsData
      .filter((item) => item.date === selectedDate)
      .filter((item) => {
        if (item.type === '決算') return filters.決算短信;
        if (item.type === '業績修正') return filters.業績修正;
        if (item.type === '配当修正') return filters.配当修正;
        if (item.type === '決算資料') return filters.決算資料;
        return filters.その他;
      });
  }, [selectedDate, filters]);

  // ソート適用（null値は末尾）
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

  // ヘッダークリックでトグル
  const handleSort = (key: string) => {
    setSortConfig((prev) =>
      prev?.key === key
        ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'desc' }
    );
  };

  // ソートアイコン
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

  const getTypeBadge = (type: string, salesYY?: number | null) => {
    switch (type) {
      case '決算':
        return <span className="inline-block px-1.5 py-0.5 rounded text-xs font-medium bg-gray-600 text-white whitespace-nowrap">決算</span>;
      case '業績修正':
        return (
          <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium whitespace-nowrap ${
            salesYY && salesYY > 0 ? 'bg-yellow-500/20 text-yellow-400' : 'bg-yellow-500/20 text-yellow-400'
          }`}>
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

  // MM/DD形式で表示
  const formatDateShort = (dateStr: string) => {
    const [, m, d] = dateStr.split('-');
    return `${m}/${d}`;
  };

  // ソート可能ヘッダーのスタイル
  const sortableThClass = 'px-3 py-2 text-left text-xs font-medium uppercase cursor-pointer hover:bg-gray-600 select-none';

  // 数値カラムの定義
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
            <h1 className="text-2xl font-bold">決算分析リアルタイムビューア</h1>
            <div className="flex items-center gap-2">
              <button
                onClick={goToPrevDate}
                className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm"
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
              >
                翌日 ▶
              </button>
              <button
                onClick={goToToday}
                className="px-3 py-1 bg-blue-600 hover:bg-blue-500 rounded text-sm"
              >
                今日
              </button>
              <span className="text-xs text-gray-400 ml-2">
                ({filteredData.length}件 / 全{availableDates.length}日分)
              </span>
            </div>
          </div>

          {/* フィルター */}
          <div className="flex items-center gap-4 mb-4">
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
            <button className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm">全展開</button>
            <button className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm">全折畳</button>
          </div>
        </div>

        {/* メインテーブル */}
        <div className="bg-gray-800 rounded-lg overflow-hidden mb-6">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-700">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase">日付</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase">時刻</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase">コード / 企業名</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase">種別</th>
                  {numericColumns.map((col) => (
                    <th
                      key={col.key}
                      onClick={() => handleSort(col.key)}
                      className={sortableThClass}
                    >
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
                      この日付のデータはありません
                    </td>
                  </tr>
                ) : (
                  sortedData.map((data, index) => (
                    <tr
                      key={index}
                      onClick={() => setSelectedCompany(data)}
                      className={`hover:bg-gray-750 cursor-pointer ${
                        selectedCompany?.code === data.code && selectedCompany?.date === data.date
                          ? 'bg-blue-900/30'
                          : ''
                      }`}
                    >
                      <td className="px-3 py-2 text-gray-400">{formatDateShort(data.date)}</td>
                      <td className="px-3 py-2">{data.time}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className="text-gray-400">{data.code}</span>{' '}
                        <span>{data.companyName}</span>
                      </td>
                      <td className="px-3 py-2">
                        {getTypeBadge(data.type, data.salesYY)}
                      </td>
                      {numericColumns.map((col) => {
                        const val = data[col.key as keyof EarningsData] as number | null;
                        return (
                          <td key={col.key} className="px-3 py-2">
                            {val !== null && val !== undefined ? (
                              <span className={val >= 0 ? 'text-green-400' : 'text-red-400'}>
                                {formatPercent(val)}
                              </span>
                            ) : (
                              '-'
                            )}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 text-xs">
                        {data.dividend !== null && (
                          <span>
                            合計{data.dividend.toFixed(2)}円
                            {data.dividendChange !== null && ` 前期比${formatPercent(data.dividendChange)}`}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 詳細パネル（選択された企業） */}
        {selectedCompany && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-gray-800 rounded-lg p-6">
              <h2 className="text-xl font-bold mb-4">
                [{selectedCompany.type}] {selectedCompany.code} {selectedCompany.companyName}
              </h2>
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold mb-2">【1Q単体実績】</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>売上高:</span>
                      <span>
                        {selectedCompany.salesYY !== null && formatPercent(selectedCompany.salesYY)} /{' '}
                        {selectedCompany.salesQQ !== null && formatPercent(selectedCompany.salesQQ)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>営業利益:</span>
                      <span>
                        {selectedCompany.operatingProfitYY !== null && formatPercent(selectedCompany.operatingProfitYY)} /{' '}
                        {selectedCompany.operatingProfitQQ !== null && formatPercent(selectedCompany.operatingProfitQQ)}
                      </span>
                    </div>
                  </div>
                </div>
                <div>
                  <h3 className="font-semibold mb-2">【配当】</h3>
                  <div className="text-sm">
                    {selectedCompany.dividend !== null ? (
                      <span>
                        今期配当期末{selectedCompany.dividend.toFixed(2)}円 / 合計{selectedCompany.dividend.toFixed(2)}円
                        {selectedCompany.dividendChange !== null && ` / 前期比${formatPercent(selectedCompany.dividendChange)}`}
                      </span>
                    ) : (
                      <span>配当予想修正: 無</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* セグメント別業績 or 四半期推移 */}
            <div className="bg-gray-800 rounded-lg p-6">
              {selectedCompany.segments ? (
                <>
                  <h2 className="text-xl font-bold mb-4">
                    セグメント別業績 ({selectedCompany.segments.period})
                  </h2>
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
                            const isHighlight =
                              seg.profitYoY !== null &&
                              seg.profitYoY !== undefined &&
                              Math.abs(seg.profitYoY) >= 30;
                            return (
                              <tr
                                key={idx}
                                className={isHighlight ? 'bg-yellow-900/20' : ''}
                              >
                                <td className="px-3 py-2">{seg.name}</td>
                                <td className="px-3 py-2 text-right">
                                  {(seg.sales / 1000000).toFixed(0)}百万
                                </td>
                                <td className="px-3 py-2 text-right">
                                  {(seg.profit / 1000000).toFixed(0)}百万
                                </td>
                                <td className="px-3 py-2 text-right">
                                  {seg.salesYoY !== null && seg.salesYoY !== undefined ? (
                                    <span className={seg.salesYoY >= 0 ? 'text-green-400' : 'text-red-400'}>
                                      {formatPercent(seg.salesYoY)}
                                    </span>
                                  ) : (
                                    '-'
                                  )}
                                </td>
                                <td className="px-3 py-2 text-right">
                                  {seg.profitYoY !== null && seg.profitYoY !== undefined ? (
                                    <span
                                      className={`${seg.profitYoY >= 0 ? 'text-green-400' : 'text-red-400'} ${
                                        isHighlight ? 'font-bold' : ''
                                      }`}
                                    >
                                      {formatPercent(seg.profitYoY)}
                                    </span>
                                  ) : (
                                    '-'
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <>
                  <h2 className="text-xl font-bold mb-4">四半期業績推移(百万円)</h2>
                  <div className="text-sm text-gray-400">
                    <p>詳細な四半期データは実装時に追加します</p>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
