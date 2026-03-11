'use client';

import { useState, useEffect, useCallback } from 'react';
import { PTSData } from '@/lib/types/financial';
import { formatCurrency, formatPercent } from '@/lib/utils/format';

// 現在日付をMM/DD形式で取得
function getTodayMMDD() {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${m}/${d}`;
}

// モックデータ生成（日付を現在日に更新）
function generateMockData() {
  const today = getTodayMMDD();
  const rising: PTSData[] = [
    {
      rank: 1,
      code: '7256',
      name: '河西工',
      companyName: '河西工業',
      closingPrice: 213,
      ptsPrice: 293,
      change: 80,
      changeRate: 37.56,
      volume: 142700,
      news: [
        { date: today, title: '中期経営計画に関するお知らせ', url: 'https://www.release.tdnet.info/inbs/I_list_001_7256.html' },
        { date: today, title: '資金使途及び支出予定時期の変更に関するお知らせ', url: 'https://www.release.tdnet.info/inbs/I_list_001_7256.html' },
      ],
    },
    {
      rank: 2,
      code: '4316',
      name: 'ビーマップ',
      companyName: 'ビーマップ',
      closingPrice: 1149,
      ptsPrice: 1430,
      change: 281,
      changeRate: 24.46,
      volume: 126500,
      news: [
        { date: today, title: '株式会社イグニスとの、自由診療クリニック向けAIネイティブ...', url: 'https://www.release.tdnet.info/inbs/I_list_001_4316.html' },
        { date: today, title: '2026年3月期第3四半期決算短信〔日本基準〕(連結)', url: 'https://www.release.tdnet.info/inbs/I_list_001_4316.html' },
      ],
    },
    {
      rank: 3,
      code: '2970',
      name: 'ジーエルシー',
      companyName: 'グッドライフカンパニー',
      closingPrice: 1019,
      ptsPrice: 1255,
      change: 236,
      changeRate: 23.16,
      volume: 41400,
      news: [
        { date: today, title: '取締役候補者の選任に関するお知らせ', url: 'https://www.release.tdnet.info/inbs/I_list_001_2970.html' },
        { date: today, title: '株主優待制度の導入に関するお知らせ', url: 'https://www.release.tdnet.info/inbs/I_list_001_2970.html' },
      ],
    },
    {
      rank: 4,
      code: '485A',
      name: 'PowerX',
      companyName: 'パワーエックス',
      closingPrice: 3025,
      ptsPrice: 3649.5,
      change: 624.5,
      changeRate: 20.64,
      volume: 177400,
      news: [
        { date: today, title: '新規事業に関するお知らせ', url: 'https://www.release.tdnet.info/inbs/I_list_001_485A.html' },
      ],
    },
  ];

  const falling: PTSData[] = [
    {
      rank: 1,
      code: '6085',
      name: 'アーキテクツ',
      companyName: 'アーキテクツ・スタジオ・ジャパン',
      closingPrice: 1615,
      ptsPrice: 1236,
      change: -379,
      changeRate: -23.47,
      volume: 44900,
      news: [
        { date: today, title: '業績予想(連結)の修正に関するお知らせ', url: 'https://www.release.tdnet.info/inbs/I_list_001_6085.html' },
        { date: today, title: '2026年2月期第3四半期決算短信〔日本基準〕(連結)', url: 'https://www.release.tdnet.info/inbs/I_list_001_6085.html' },
      ],
    },
    {
      rank: 2,
      code: '248A',
      name: 'キッズスター',
      companyName: 'キッズスター',
      closingPrice: 1450,
      ptsPrice: 1168,
      change: -282,
      changeRate: -19.45,
      volume: 46100,
      news: [
        { date: today, title: '2025年12月期決算説明資料', url: 'https://www.release.tdnet.info/inbs/I_list_001_248A.html' },
        { date: today, title: '2025年12月期決算短信〔日本基準〕(連結)', url: 'https://www.release.tdnet.info/inbs/I_list_001_248A.html' },
      ],
    },
    {
      rank: 3,
      code: '352A',
      name: 'ロイブ',
      companyName: 'ロイブ',
      closingPrice: 706,
      ptsPrice: 588,
      change: -118,
      changeRate: -16.71,
      volume: 64000,
      news: [
        { date: today, title: '2026年3月期第3四半期決算説明会資料', url: 'https://www.release.tdnet.info/inbs/I_list_001_352A.html' },
        { date: today, title: '2026年3月期第3四半期決算短信〔日本基準〕(非連結)', url: 'https://www.release.tdnet.info/inbs/I_list_001_352A.html' },
      ],
    },
    {
      rank: 4,
      code: '7771',
      name: '日本精密',
      companyName: '日本精密',
      closingPrice: 625,
      ptsPrice: 525,
      change: -100,
      changeRate: -16.00,
      volume: 10600,
      news: [
        { date: today, title: '令和8年3月期第3四半期決算短信〔日本基準〕(連結)', url: 'https://www.release.tdnet.info/inbs/I_list_001_7771.html' },
        { date: today, title: '営業外収益の計上に関するお知らせ', url: 'https://www.release.tdnet.info/inbs/I_list_001_7771.html' },
      ],
    },
  ];

  return { rising, falling };
}

export default function PTSPage() {
  const [activeTab, setActiveTab] = useState<'rising' | 'falling'>('rising');
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [data, setData] = useState(() => generateMockData());

  // データを更新する関数
  const refreshData = useCallback(() => {
    setData(generateMockData());
    setLastUpdated(new Date());
  }, []);

  // 5分間隔で自動更新
  useEffect(() => {
    const interval = setInterval(refreshData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [refreshData]);

  // 更新日時のフォーマット
  const formatUpdatedAt = (date: Date) => {
    return date.toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* ヘッダー */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <div className="w-4 h-4 bg-green-500 rounded flex items-center justify-center">
              <span className="text-white text-xs">↑</span>
            </div>
            <h1 className="text-2xl font-bold">
              PTS Night {activeTab === 'rising' ? '値上がり' : '値下がり'} Ranking
            </h1>
          </div>
          <div className="flex items-center gap-3 text-sm text-gray-400">
            <span>出来高200株以上</span>
            <span>更新: {formatUpdatedAt(lastUpdated)}</span>
            <button
              onClick={refreshData}
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm text-white"
            >
              更新
            </button>
          </div>
        </div>

        {/* タブ */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab('rising')}
            className={`px-4 py-2 rounded ${
              activeTab === 'rising' ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'
            }`}
          >
            値上がり
          </button>
          <button
            onClick={() => setActiveTab('falling')}
            className={`px-4 py-2 rounded ${
              activeTab === 'falling' ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'
            }`}
          >
            値下がり
          </button>
        </div>

        {/* テーブル */}
        <div className="bg-gray-800 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-700">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase">#</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase">CODE / 銘柄</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase">終値</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase">PTS</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase">騰落</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase">変化率</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase">出来高</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase">直近の開示・ニュース</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {(activeTab === 'rising' ? data.rising : data.falling).map((item) => (
                  <tr
                    key={item.code}
                    className={`hover:bg-gray-750 ${
                      item.rank <= 3 ? 'bg-red-900/20' : ''
                    }`}
                  >
                    <td className="px-4 py-3 text-sm font-bold">{item.rank}</td>
                    <td className="px-4 py-3 text-sm whitespace-nowrap">
                      <span className="text-gray-400">{item.code}</span>{' '}
                      <span>{item.companyName || item.name}</span>
                    </td>
                    <td className="px-4 py-3 text-sm">{formatCurrency(item.closingPrice)}</td>
                    <td className="px-4 py-3 text-sm">{formatCurrency(item.ptsPrice)}</td>
                    <td className={`px-4 py-3 text-sm ${
                      item.change >= 0 ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {item.change >= 0 ? '+' : ''}{item.change}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-1 rounded ${
                          item.changeRate >= 0
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-red-500/20 text-red-400'
                        }`}
                      >
                        {formatPercent(item.changeRate)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">{item.volume.toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm">
                      <div className="space-y-1">
                        {item.news.map((n, idx) => (
                          <div key={idx} className="text-xs">
                            <span className="text-gray-500">{n.date}</span>{' '}
                            {n.url ? (
                              <a
                                href={n.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-400 hover:text-blue-300 hover:underline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {n.title}
                              </a>
                            ) : (
                              <span className="text-gray-400">{n.title}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* フッター */}
        <div className="mt-4 flex justify-between text-xs text-gray-500">
          <span>データ出典:株探 / 5分間隔で自動更新</span>
          <span>※投資は自己責任で</span>
        </div>
      </div>
    </div>
  );
}
