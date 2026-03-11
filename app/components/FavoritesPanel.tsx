'use client';

import { useState, useEffect } from 'react';
import { Stock } from '@/lib/types/stock';
import { getFavorites, removeFavorite, getFavoriteStocks } from '@/lib/utils/favorites';
import { Button } from './ui/button';
import { formatCurrency } from '@/lib/utils/format';
import Link from 'next/link';

interface FavoritesPanelProps {
  allStocks: Stock[];
}

export function FavoritesPanel({ allStocks }: FavoritesPanelProps) {
  const [favoriteCodes, setFavoriteCodes] = useState<string[]>([]);
  const [favoriteStocks, setFavoriteStocks] = useState<Stock[]>([]);
  const [isExpanded, setIsExpanded] = useState(true);

  useEffect(() => {
    const codes = getFavorites();
    setFavoriteCodes(codes);
    const stocks = getFavoriteStocks(allStocks);
    setFavoriteStocks(stocks);
  }, [allStocks]);

  const handleRemove = (code: string) => {
    removeFavorite(code);
    const updated = getFavorites();
    setFavoriteCodes(updated);
    const stocks = getFavoriteStocks(allStocks);
    setFavoriteStocks(stocks);
  };

  const handleClearAll = () => {
    if (confirm('すべてのお気に入りを削除しますか？')) {
      localStorage.removeItem('stock-screening-favorites');
      setFavoriteCodes([]);
      setFavoriteStocks([]);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      <button
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold">お気に入り銘柄</h2>
          {favoriteCodes.length > 0 && (
            <span className="bg-yellow-100 text-yellow-700 text-xs font-bold px-2 py-0.5 rounded-full">
              {favoriteCodes.length}
            </span>
          )}
        </div>
        <svg
          className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isExpanded && (
        <div className="px-4 pb-4">
          {favoriteStocks.length === 0 ? (
            <div className="text-center py-6 text-gray-400">
              <div className="text-3xl mb-2">☆</div>
              <p className="text-sm">お気に入り銘柄がありません</p>
              <p className="text-xs mt-1">テーブルの★から追加できます</p>
            </div>
          ) : (
            <>
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {favoriteStocks.map((stock) => (
                  <div
                    key={stock.code}
                    className="flex items-center justify-between p-2 rounded-md hover:bg-gray-50 group"
                  >
                    <Link
                      href={`/stocks/${stock.code}`}
                      className="flex-1 flex items-center gap-2 min-w-0"
                    >
                      <span className="font-mono font-medium text-sm text-blue-600">{stock.code}</span>
                      <span className="text-sm truncate text-gray-700">{stock.name}</span>
                      <span className="text-sm font-medium text-gray-500 ml-auto shrink-0">{formatCurrency(stock.price)}</span>
                    </Link>
                    <button
                      onClick={() => handleRemove(stock.code)}
                      className="ml-2 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="削除"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              {favoriteCodes.length > 0 && (
                <div className="mt-3 pt-3 border-t">
                  <Button variant="ghost" size="sm" onClick={handleClearAll} className="w-full text-gray-400 hover:text-red-500">
                    すべて削除
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
