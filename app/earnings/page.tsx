'use client';

import { useState } from 'react';
import { EarningsData } from '@/lib/types/financial';
import { formatPercent } from '@/lib/utils/format';

// モックデータ
const mockEarningsData: EarningsData[] = [
  {
    time: '13:36',
    code: '5237',
    companyName: 'ノザワ',
    type: '決算',
    salesQQ: -8.7,
    operatingProfitQQ: -13.8,
    ordinaryProfitQQ: -10.6,
    netProfitQQ: -17.9,
    salesYY: -7.8,
    operatingProfitYY: -12.6,
    ordinaryProfitYY: -14.3,
    netProfitYY: -34.4,
    salesCon: 0.0,
    operatingProfitCon: 0.0,
    ordinaryProfitCon: 0.0,
    netProfitCon: 0.0,
    dividend: 40.00,
    dividendChange: 0.0,
  },
  {
    time: '13:37',
    code: '4061',
    companyName: 'デンカ',
    type: '業績修正',
    salesQQ: -8.3,
    operatingProfitQQ: 13.7,
    ordinaryProfitQQ: 35.0,
    netProfitQQ: 248.6,
    salesYY: -8.3,
    operatingProfitYY: 247.9,
    ordinaryProfitYY: 655.5,
    netProfitYY: 305.4,
    salesCon: -1.9,
    operatingProfitCon: -3.5,
    ordinaryProfitCon: -6.4,
    netProfitCon: -2.0,
    dividend: 100.00,
    dividendChange: 0.0,
  },
  {
    time: '13:37',
    code: '3103',
    companyName: 'ユニチカ',
    type: '業績修正',
    salesQQ: 7.2,
    operatingProfitQQ: 20.9,
    ordinaryProfitQQ: 32.7,
    netProfitQQ: 395.2,
    salesYY: 4.7,
    operatingProfitYY: 64.3,
    ordinaryProfitYY: 3.1,
    netProfitYY: 197.1,
    salesCon: 4.8,
    operatingProfitCon: 26.7,
    ordinaryProfitCon: 50.0,
    netProfitCon: 2100.0,
    dividend: 0.00,
    dividendChange: null,
  },
  {
    time: '13:37',
    code: '3563',
    companyName: 'FOOD & LIFE COMPANIES',
    type: '決算',
    salesQQ: 5.4,
    operatingProfitQQ: 95.5,
    ordinaryProfitQQ: 108.9,
    netProfitQQ: 75.6,
    salesYY: 23.7,
    operatingProfitYY: 40.5,
    ordinaryProfitYY: 41.5,
    netProfitYY: 39.4,
    salesCon: 7.2,
    operatingProfitCon: 22.6,
    ordinaryProfitCon: 32.3,
    netProfitCon: 33.8,
    dividend: 35.00,
    dividendChange: 0.0,
  },
];

export default function EarningsPage() {
  const [selectedDate, setSelectedDate] = useState('2026-02-07');
  const [selectedCompany, setSelectedCompany] = useState<EarningsData | null>(null);
  const [filters, setFilters] = useState({
    決算短信: true,
    業績修正: true,
    配当修正: false,
    決算資料: false,
    その他: false,
  });

  const filteredData = mockEarningsData.filter((item) => {
    if (item.type === '決算') return filters.決算短信;
    if (item.type === '業績修正') return filters.業績修正;
    if (item.type === '配当修正') return filters.配当修正;
    if (item.type === '決算資料') return filters.決算資料;
    return filters.その他;
  });

  const getTypeColor = (type: string) => {
    switch (type) {
      case '業績修正':
        return 'text-yellow-400';
      case '配当修正':
        return 'text-blue-400';
      default:
        return 'text-white';
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* ヘッダー */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-2xl font-bold">決算分析リアルタイムビューア</h1>
            <div className="flex items-center gap-4">
              <span className="text-gray-400">日付: {selectedDate}</span>
              <div className="flex gap-2">
                <button className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded">移動</button>
                <button className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded">今日</button>
                <button className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded">再読込</button>
              </div>
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
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase">時刻</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase">コード</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase">企業名</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase">種別</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase">売QQ</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase">営QQ</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase">経QQ</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase">利QQ</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase">売YY</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase">営YY</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase">経YY</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase">利YY</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase">売Con</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase">営Con</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase">経Con</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase">利Con</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase">情報</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {filteredData.map((data, index) => (
                  <tr
                    key={index}
                    onClick={() => setSelectedCompany(data)}
                    className={`hover:bg-gray-750 cursor-pointer ${
                      selectedCompany?.code === data.code ? 'bg-blue-900/30' : ''
                    }`}
                  >
                    <td className="px-3 py-2">{data.time}</td>
                    <td className="px-3 py-2">{data.code}</td>
                    <td className="px-3 py-2">{data.companyName}</td>
                    <td className={`px-3 py-2 ${getTypeColor(data.type)}`}>
                      {data.type}
                      {data.type === '業績修正' && (data.salesYY && data.salesYY > 0 ? '↑' : '↓')}
                    </td>
                    <td className="px-3 py-2">
                      {data.salesQQ !== null ? (
                        <span className={data.salesQQ >= 0 ? 'text-green-400' : 'text-red-400'}>
                          {formatPercent(data.salesQQ)}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {data.operatingProfitQQ !== null ? (
                        <span className={data.operatingProfitQQ >= 0 ? 'text-green-400' : 'text-red-400'}>
                          {formatPercent(data.operatingProfitQQ)}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {data.ordinaryProfitQQ !== null ? (
                        <span className={data.ordinaryProfitQQ >= 0 ? 'text-green-400' : 'text-red-400'}>
                          {formatPercent(data.ordinaryProfitQQ)}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {data.netProfitQQ !== null ? (
                        <span className={data.netProfitQQ >= 0 ? 'text-green-400' : 'text-red-400'}>
                          {formatPercent(data.netProfitQQ)}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {data.salesYY !== null ? (
                        <span className={data.salesYY >= 0 ? 'text-green-400' : 'text-red-400'}>
                          {formatPercent(data.salesYY)}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {data.operatingProfitYY !== null ? (
                        <span className={data.operatingProfitYY >= 0 ? 'text-green-400' : 'text-red-400'}>
                          {formatPercent(data.operatingProfitYY)}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {data.ordinaryProfitYY !== null ? (
                        <span className={data.ordinaryProfitYY >= 0 ? 'text-green-400' : 'text-red-400'}>
                          {formatPercent(data.ordinaryProfitYY)}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {data.netProfitYY !== null ? (
                        <span className={data.netProfitYY >= 0 ? 'text-green-400' : 'text-red-400'}>
                          {formatPercent(data.netProfitYY)}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {data.salesCon !== null ? (
                        <span className={data.salesCon >= 0 ? 'text-green-400' : 'text-red-400'}>
                          {formatPercent(data.salesCon)}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {data.operatingProfitCon !== null ? (
                        <span className={data.operatingProfitCon >= 0 ? 'text-green-400' : 'text-red-400'}>
                          {formatPercent(data.operatingProfitCon)}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {data.ordinaryProfitCon !== null ? (
                        <span className={data.ordinaryProfitCon >= 0 ? 'text-green-400' : 'text-red-400'}>
                          {formatPercent(data.ordinaryProfitCon)}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {data.netProfitCon !== null ? (
                        <span className={data.netProfitCon >= 0 ? 'text-green-400' : 'text-red-400'}>
                          {formatPercent(data.netProfitCon)}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {data.dividend !== null && (
                        <span>
                          合計{data.dividend.toFixed(2)}円
                          {data.dividendChange !== null && ` 前期比${formatPercent(data.dividendChange)}`}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
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

            <div className="bg-gray-800 rounded-lg p-6">
              <h2 className="text-xl font-bold mb-4">四半期業績推移(百万円)</h2>
              <div className="text-sm text-gray-400">
                <p>詳細な四半期データは実装時に追加します</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
