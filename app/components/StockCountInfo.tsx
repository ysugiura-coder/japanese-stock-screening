'use client';

import { StocksResponse } from '@/lib/types/stock';
import Link from 'next/link';

interface StockCountInfoProps {
  data: StocksResponse | undefined;
}

export function StockCountInfo({ data }: StockCountInfoProps) {
  const currentCount = data?.total || 0;
  const totalCount = 3700;
  const percentage = totalCount > 0 ? Math.round((currentCount / totalCount) * 100) : 0;

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 md:p-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex items-center gap-3">
          <div>
            <p className="text-sm font-medium text-blue-900">
              取得データ: <span className="font-bold text-lg">{currentCount.toLocaleString()}</span> 銘柄
            </p>
            <div className="flex items-center gap-2 mt-1">
              <div className="w-32 h-2 bg-blue-200 rounded-full overflow-hidden">
                <div className="h-full bg-blue-600 rounded-full transition-all" style={{ width: `${Math.min(percentage, 100)}%` }} />
              </div>
              <span className="text-xs text-blue-700">{percentage}%</span>
            </div>
          </div>
        </div>
        {currentCount < totalCount && (
          <Link href="/settings" className="text-xs text-blue-600 hover:underline shrink-0">
            全銘柄を取得するには →
          </Link>
        )}
      </div>
    </div>
  );
}
