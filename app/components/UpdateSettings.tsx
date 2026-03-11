'use client';

import { useState, useEffect } from 'react';
import { UpdateInterval, UpdateSettings as UpdateSettingsType } from '@/lib/types/stock';
import { Button } from './ui/button';
import { Select } from './ui/select';
import { Label } from './ui/label';
import { formatDateTime } from '@/lib/utils/format';

interface UpdateSettingsProps {
  onUpdate: () => Promise<void>;
  lastUpdate?: string;
  isLoading?: boolean;
}

export function UpdateSettings({ onUpdate, lastUpdate, isLoading }: UpdateSettingsProps) {
  const [settings, setSettings] = useState<UpdateSettingsType>({
    interval: '24h',
    lastUpdate: lastUpdate,
  });
  const [nextUpdate, setNextUpdate] = useState<string | undefined>();

  useEffect(() => {
    if (lastUpdate) {
      setSettings(prev => ({ ...prev, lastUpdate }));
    }
  }, [lastUpdate]);

  useEffect(() => {
    if (settings.interval === 'manual') {
      setNextUpdate(undefined);
      return;
    }

    const intervalMs = getIntervalMs(settings.interval);
    if (settings.lastUpdate) {
      const lastUpdateTime = new Date(settings.lastUpdate).getTime();
      const nextUpdateTime = lastUpdateTime + intervalMs;
      setNextUpdate(new Date(nextUpdateTime).toISOString());
    } else {
      setNextUpdate(new Date(Date.now() + intervalMs).toISOString());
    }
  }, [settings.interval, settings.lastUpdate]);

  useEffect(() => {
    if (settings.interval === 'manual') return;

    const intervalMs = getIntervalMs(settings.interval);
    const intervalId = setInterval(() => {
      onUpdate();
    }, intervalMs);

    return () => clearInterval(intervalId);
  }, [settings.interval, onUpdate]);

  const getIntervalMs = (interval: UpdateInterval): number => {
    switch (interval) {
      case '1h':
        return 60 * 60 * 1000;
      case '6h':
        return 6 * 60 * 60 * 1000;
      case '12h':
        return 12 * 60 * 60 * 1000;
      case '24h':
        return 24 * 60 * 60 * 1000;
      default:
        return 0;
    }
  };

  const handleIntervalChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSettings(prev => ({
      ...prev,
      interval: e.target.value as UpdateInterval,
    }));
  };

  const handleManualUpdate = async () => {
    try {
      await onUpdate();
    } catch (error) {
      console.error('Failed to update:', error);
      alert('データの更新に失敗しました。しばらくしてから再度お試しください。');
    }
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <h2 className="text-xl font-bold mb-4">データ更新設定</h2>
      
      <div className="space-y-4">
        <div>
          <Label htmlFor="update-interval">更新頻度</Label>
          <Select
            id="update-interval"
            value={settings.interval}
            onChange={handleIntervalChange}
            className="mt-1"
          >
            <option value="manual">手動更新</option>
            <option value="1h">1時間ごと</option>
            <option value="6h">6時間ごと</option>
            <option value="12h">12時間ごと</option>
            <option value="24h">24時間ごと</option>
          </Select>
        </div>

        {settings.lastUpdate && (
          <div className="text-sm text-gray-600">
            <p>最終更新: {formatDateTime(settings.lastUpdate)}</p>
          </div>
        )}

        {nextUpdate && (
          <div className="text-sm text-gray-600">
            <p>次回更新予定: {formatDateTime(nextUpdate)}</p>
          </div>
        )}

        <div>
          <Button
            onClick={handleManualUpdate}
            disabled={isLoading}
            className="w-full"
          >
            {isLoading ? '更新中...' : '手動更新'}
          </Button>
        </div>
      </div>
    </div>
  );
}
