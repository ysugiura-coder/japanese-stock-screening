'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { Stock } from '@/lib/types/stock';
import { SortField, SortDirection } from '@/lib/types/stock';
import { sortStocks } from '@/lib/utils/screening';
import { isFavorite, addFavorite, removeFavorite } from '@/lib/utils/favorites';
import {
  formatNumber,
  formatCurrency,
  formatPercent,
  formatMarketCap,
  formatVolume,
  convertToCSV,
} from '@/lib/utils/format';
import { Button } from './ui/button';
import { Select } from './ui/select';
import { Label } from './ui/label';

interface StockTableProps {
  stocks: Stock[];
}

const ITEMS_PER_PAGE_OPTIONS = [10, 20, 50, 100] as const;
const STORAGE_KEY = 'stock-screening-items-per-page';

export function StockTable({ stocks }: StockTableProps) {
  const [sortField, setSortField] = useState<SortField>('code');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(20);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  useEffect(() => {
    const favoriteCodes = new Set<string>();
    stocks.forEach(stock => {
      if (isFavorite(stock.code)) {
        favoriteCodes.add(stock.code);
      }
    });
    setFavorites(favoriteCodes);
  }, [stocks]);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = parseInt(saved, 10);
      if (ITEMS_PER_PAGE_OPTIONS.includes(parsed as any)) {
        setItemsPerPage(parsed);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, itemsPerPage.toString());
  }, [itemsPerPage]);

  const sortedStocks = useMemo(() => {
    return sortStocks(stocks, sortField, sortDirection);
  }, [stocks, sortField, sortDirection]);

  const paginatedStocks = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    return sortedStocks.slice(start, end);
  }, [sortedStocks, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(sortedStocks.length / itemsPerPage);

  const handleItemsPerPageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newItemsPerPage = parseInt(e.target.value, 10);
    setItemsPerPage(newItemsPerPage);
    setCurrentPage(1);
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleExportCSV = () => {
    const csv = convertToCSV(sortedStocks);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `stocks_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleToggleFavorite = (code: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (favorites.has(code)) {
      removeFavorite(code);
      setFavorites(prev => {
        const next = new Set(prev);
        next.delete(code);
        return next;
      });
    } else {
      addFavorite(code);
      setFavorites(prev => new Set(prev).add(code));
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <span className="text-gray-300">↕</span>;
    return sortDirection === 'asc' ? <span className="text-blue-600">↑</span> : <span className="text-blue-600">↓</span>;
  };

  if (stocks.length === 0) {
    return (
      <div className="bg-white p-8 rounded-lg shadow-md text-center">
        <div className="text-gray-400 text-4xl mb-3">📭</div>
        <p className="text-gray-500 font-medium">条件に一致する銘柄が見つかりませんでした</p>
        <p className="text-gray-400 text-sm mt-1">スクリーニング条件を変更してお試しください</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      {/* ヘッダー */}
      <div className="p-3 md:p-4 border-b">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h2 className="text-lg md:text-xl font-bold">
            検索結果: <span className="text-blue-600">{sortedStocks.length}</span>件
          </h2>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Label htmlFor="items-per-page" className="text-sm shrink-0">表示:</Label>
              <Select id="items-per-page" value={itemsPerPage} onChange={handleItemsPerPageChange} className="w-20">
                {ITEMS_PER_PAGE_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option}件</option>
                ))}
              </Select>
            </div>
            <Button onClick={handleExportCSV} variant="outline" size="sm" className="shrink-0">
              CSV出力
            </Button>
          </div>
        </div>
      </div>

      {/* デスクトップ: テーブル表示 */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase w-10">★</th>
              {[
                { field: 'code' as SortField, label: 'コード' },
                { field: 'name' as SortField, label: '銘柄名' },
                { field: 'price' as SortField, label: '株価' },
                { field: 'marketCap' as SortField, label: '時価総額' },
                { field: 'volume' as SortField, label: '出来高' },
                { field: 'per' as SortField, label: 'PER' },
                { field: 'pbr' as SortField, label: 'PBR' },
                { field: 'roe' as SortField, label: 'ROE' },
                { field: 'dividendYield' as SortField, label: '配当利回り' },
              ].map(({ field, label }) => (
                <th
                  key={field}
                  className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100 transition-colors"
                  onClick={() => handleSort(field)}
                >
                  <div className="flex items-center gap-1">
                    {label}
                    <SortIcon field={field} />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {paginatedStocks.map((stock) => (
              <tr key={stock.code} className="hover:bg-blue-50/50 transition-colors">
                <td className="px-3 py-3">
                  <button
                    onClick={(e) => handleToggleFavorite(stock.code, e)}
                    className={`text-xl transition-colors ${
                      favorites.has(stock.code) ? 'text-yellow-400 hover:text-yellow-500' : 'text-gray-200 hover:text-yellow-300'
                    }`}
                    title={favorites.has(stock.code) ? 'お気に入りから削除' : 'お気に入りに追加'}
                  >
                    ★
                  </button>
                </td>
                <td className="px-3 py-3 text-sm font-medium">
                  <Link href={`/stocks/${stock.code}`} className="text-blue-600 hover:underline">{stock.code}</Link>
                </td>
                <td className="px-3 py-3 text-sm">
                  <Link href={`/stocks/${stock.code}`} className="hover:text-blue-600">{stock.name}</Link>
                </td>
                <td className="px-3 py-3 text-sm font-medium">{formatCurrency(stock.price)}</td>
                <td className="px-3 py-3 text-sm">{formatMarketCap(stock.marketCap)}</td>
                <td className="px-3 py-3 text-sm">{formatVolume(stock.volume)}</td>
                <td className="px-3 py-3 text-sm">{formatNumber(stock.per)}</td>
                <td className="px-3 py-3 text-sm">{formatNumber(stock.pbr)}</td>
                <td className="px-3 py-3 text-sm">{formatPercent(stock.roe)}</td>
                <td className="px-3 py-3 text-sm">{formatPercent(stock.dividendYield)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* モバイル: カード表示 */}
      <div className="md:hidden divide-y divide-gray-100">
        {paginatedStocks.map((stock) => (
          <div key={stock.code} className="p-3 hover:bg-gray-50 transition-colors">
            <div className="flex items-start justify-between mb-2">
              <Link href={`/stocks/${stock.code}`} className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-blue-600">{stock.code}</span>
                  <span className="text-sm text-gray-700 truncate">{stock.name}</span>
                </div>
                <div className="text-lg font-bold mt-1">{formatCurrency(stock.price)}</div>
              </Link>
              <button
                onClick={(e) => handleToggleFavorite(stock.code, e)}
                className={`text-xl ml-2 ${
                  favorites.has(stock.code) ? 'text-yellow-400' : 'text-gray-200'
                }`}
              >
                ★
              </button>
            </div>
            <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-xs text-gray-500">
              <div>PER <span className="text-gray-900 font-medium">{formatNumber(stock.per)}</span></div>
              <div>PBR <span className="text-gray-900 font-medium">{formatNumber(stock.pbr)}</span></div>
              <div>ROE <span className="text-gray-900 font-medium">{formatPercent(stock.roe)}</span></div>
              <div>配当 <span className="text-gray-900 font-medium">{formatPercent(stock.dividendYield)}</span></div>
              <div>時価総額 <span className="text-gray-900 font-medium">{formatMarketCap(stock.marketCap)}</span></div>
              <div>出来高 <span className="text-gray-900 font-medium">{formatVolume(stock.volume)}</span></div>
            </div>
          </div>
        ))}
      </div>

      {/* ページネーション */}
      {totalPages > 1 && (
        <div className="p-3 md:p-4 border-t flex flex-col sm:flex-row justify-center items-center gap-2">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setCurrentPage(1)} disabled={currentPage === 1}>
              最初
            </Button>
            <Button variant="outline" size="sm" onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))} disabled={currentPage === 1}>
              前へ
            </Button>
            <span className="text-sm text-gray-600 px-3">
              <span className="font-bold">{currentPage}</span> / {totalPages}
            </span>
            <Button variant="outline" size="sm" onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))} disabled={currentPage === totalPages}>
              次へ
            </Button>
            <Button variant="outline" size="sm" onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages}>
              最後
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
