'use client';

import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Stock, ScreeningCriteria, StocksResponse } from '@/lib/types/stock';
import { screenStocks } from '@/lib/utils/screening';
import { ScreeningForm } from './components/ScreeningForm';
import { StockTable } from './components/StockTable';
import { UpdateSettings } from './components/UpdateSettings';
import { FavoritesPanel } from './components/FavoritesPanel';
import { StockCountInfo } from './components/StockCountInfo';

async function fetchStocks(): Promise<StocksResponse> {
  let email = '';
  let password = '';
  let apiKey = '';
  let apiBase = 'https://api.jquants.com/v1';
  const authMethod = typeof window !== 'undefined' ? localStorage.getItem('jquants_auth_method') || 'email' : 'email';

  if (typeof window !== 'undefined') {
    email = localStorage.getItem('jquants_email') || '';
    password = localStorage.getItem('jquants_password') || '';
    apiKey = localStorage.getItem('jquants_api_key') || '';
    apiBase = localStorage.getItem('jquants_api_base') || 'https://api.jquants.com/v1';
  }

  const headers: HeadersInit = {};
  if (email && password) {
    headers['x-jquants-email'] = email;
    headers['x-jquants-password'] = password;
    headers['x-api-base'] = apiBase;
  } else if (apiKey) {
    headers['x-jquants-api-key'] = apiKey;
    headers['x-api-base'] = apiBase;
  }

  const response = await fetch('/api/stocks', { headers });
  if (!response.ok) {
    throw new Error('Failed to fetch stocks');
  }
  return response.json();
}

async function updateStocks(): Promise<void> {
  let email = '';
  let password = '';
  let apiKey = '';
  let apiBase = 'https://api.jquants.com/v1';
  const authMethod = typeof window !== 'undefined' ? localStorage.getItem('jquants_auth_method') || 'email' : 'email';

  if (typeof window !== 'undefined') {
    email = localStorage.getItem('jquants_email') || '';
    password = localStorage.getItem('jquants_password') || '';
    apiKey = localStorage.getItem('jquants_api_key') || '';
    apiBase = localStorage.getItem('jquants_api_base') || 'https://api.jquants.com/v1';
  }

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  if (authMethod === 'email' && email && password) {
    headers['x-jquants-email'] = email;
    headers['x-jquants-password'] = password;
    headers['x-api-base'] = apiBase;
  } else if (authMethod === 'apikey' && apiKey) {
    headers['x-jquants-api-key'] = apiKey;
    headers['x-api-base'] = apiBase;
  }

  const response = await fetch('/api/update', {
    method: 'POST',
    headers,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || 'Failed to update stocks');
  }
}

export default function Home() {
  const [criteria, setCriteria] = useState<ScreeningCriteria>({ listedOnly: true });
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery<StocksResponse>({
    queryKey: ['stocks'],
    queryFn: fetchStocks,
    staleTime: 60 * 1000,
  });

  const updateMutation = useMutation({
    mutationFn: updateStocks,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stocks'] });
    },
  });

  const [filteredStocks, setFilteredStocks] = useState<Stock[]>([]);

  useEffect(() => {
    if (data?.stocks) {
      const hasCriteria =
        (criteria.codes && criteria.codes.length > 0) ||
        criteria.favoritesOnly === true ||
        criteria.listedOnly === true ||
        (criteria.exchanges && criteria.exchanges.length > 0) ||
        (criteria.per && (criteria.per.min !== undefined || criteria.per.max !== undefined)) ||
        (criteria.pbr && (criteria.pbr.min !== undefined || criteria.pbr.max !== undefined)) ||
        (criteria.roe && (criteria.roe.min !== undefined || criteria.roe.max !== undefined)) ||
        (criteria.dividendYield && (criteria.dividendYield.min !== undefined || criteria.dividendYield.max !== undefined)) ||
        (criteria.marketCap && (criteria.marketCap.min !== undefined || criteria.marketCap.max !== undefined)) ||
        (criteria.volume && (criteria.volume.min !== undefined || criteria.volume.max !== undefined)) ||
        (criteria.price && (criteria.price.min !== undefined || criteria.price.max !== undefined));

      if (!hasCriteria) {
        setFilteredStocks(data.stocks);
      } else {
        const filtered = screenStocks(data.stocks, criteria);
        setFilteredStocks(filtered);
      }
    }
  }, [data, criteria]);

  const handleSearch = (newCriteria: ScreeningCriteria) => {
    setCriteria(newCriteria);
  };

  const handleReset = () => {
    setCriteria({ listedOnly: true });
  };

  const handleUpdate = useCallback(async () => {
    try {
      await updateMutation.mutateAsync();
    } catch (error) {
      console.error('Update failed:', error);
    }
  }, [updateMutation]);

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-4xl mx-auto mt-8">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
            <div className="text-4xl mb-3">⚠️</div>
            <p className="font-bold text-red-700 mb-1">データの取得に失敗しました</p>
            <p className="text-red-600 text-sm mb-4">{error instanceof Error ? error.message : 'Unknown error'}</p>
            <button
              onClick={() => queryClient.refetchQueries({ queryKey: ['stocks'] })}
              className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              再試行
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-7xl mx-auto px-4 py-4 md:py-6 space-y-4 md:space-y-6">
        {data && <StockCountInfo data={data} />}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
          <div className="lg:col-span-2 space-y-4 md:space-y-6">
            <ScreeningForm onSearch={handleSearch} onReset={handleReset} />

            {isLoading ? (
              <div className="bg-white p-8 rounded-lg shadow-md text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-3"></div>
                <p className="text-gray-500">データを読み込み中...</p>
              </div>
            ) : (
              <StockTable stocks={filteredStocks} />
            )}
          </div>

          <div className="space-y-4 md:space-y-6">
            <UpdateSettings
              onUpdate={handleUpdate}
              lastUpdate={data?.updatedAt}
              isLoading={updateMutation.isPending}
            />
            {data && <FavoritesPanel allStocks={data.stocks} />}
          </div>
        </div>
      </main>
    </div>
  );
}
