'use client';

import { useState, useMemo } from 'react';
import { OrderData } from '@/lib/types/financial';
import { formatPercent } from '@/lib/utils/format';

type SortConfig = { key: string; direction: 'asc' | 'desc' } | null;

// モックデータ
const mockOrderData: OrderData[] = [
  {
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
  {
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
];

export default function OrdersPage() {
  const [selectedDate, setSelectedDate] = useState('2026-02-10');
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);

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

  const sortedData = useMemo(() => {
    if (!sortConfig) return mockOrderData;
    return [...mockOrderData].sort((a, b) => {
      const aVal = a[sortConfig.key as keyof OrderData] as number | null;
      const bVal = b[sortConfig.key as keyof OrderData] as number | null;
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;
      return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
    });
  }, [sortConfig]);

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
        {/* ヘッダー */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">受注一覧</h1>
          <div className="flex items-center gap-4">
            <span className="text-gray-400">日付: {selectedDate}</span>
            <div className="flex gap-2">
              <button className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded">移動</button>
              <button className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded">◀前日</button>
              <button className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded">翌日▶</button>
              <button className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded">再取得</button>
            </div>
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
                {sortedData.map((order, index) => (
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
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
