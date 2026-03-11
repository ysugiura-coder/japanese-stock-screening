'use client';

import { useState } from 'react';
import { ScreeningCriteria } from '@/lib/types/stock';
import { getFavorites } from '@/lib/utils/favorites';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Tooltip } from './Tooltip';

interface ScreeningFormProps {
  onSearch: (criteria: ScreeningCriteria) => void;
  onReset: () => void;
}

// プリセット条件
const PRESETS: { label: string; description: string; criteria: ScreeningCriteria }[] = [
  {
    label: '高配当株',
    description: '配当利回り3%以上、PBR1.5倍以下',
    criteria: { dividendYield: { min: 3 }, pbr: { max: 1.5 } },
  },
  {
    label: '割安成長株',
    description: 'PER15倍以下、ROE10%以上',
    criteria: { per: { max: 15 }, roe: { min: 10 } },
  },
  {
    label: '大型安定株',
    description: '時価総額1兆円以上、配当利回り2%以上',
    criteria: { marketCap: { min: 1000000000000 }, dividendYield: { min: 2 } },
  },
  {
    label: 'バリュー株',
    description: 'PBR1倍以下、ROE8%以上、配当利回り3%以上',
    criteria: { pbr: { max: 1 }, roe: { min: 8 }, dividendYield: { min: 3 } },
  },
];

// ツールチップ定義
const TOOLTIPS: Record<string, string> = {
  per: 'PER = 株価 ÷ EPS。低いほど割安。一般的に10〜15倍が割安圏。',
  pbr: 'PBR = 株価 ÷ BPS。1倍以下は純資産割れで割安とされる。',
  roe: 'ROE = 純利益 ÷ 自己資本。高いほど効率的。8%以上が目安。',
  dividendYield: '年間配当金 ÷ 株価 × 100。3%以上で高配当とされる。',
  marketCap: '発行済株式数 × 株価。企業の規模を示す。',
  volume: '一定期間内に売買された株数。流動性の指標。',
  price: '1株あたりの現在の取引価格。',
};

export function ScreeningForm({ onSearch, onReset }: ScreeningFormProps) {
  const [criteria, setCriteria] = useState<ScreeningCriteria>({});
  const [codeInput, setCodeInput] = useState('');
  const [isExpanded, setIsExpanded] = useState(true);

  const handleChange = (field: 'per' | 'pbr' | 'roe' | 'dividendYield' | 'marketCap' | 'volume' | 'price', type: 'min' | 'max', value: string) => {
    const numValue = value === '' ? undefined : parseFloat(value);
    setCriteria(prev => ({
      ...prev,
      [field]: {
        ...prev[field] as { min?: number; max?: number },
        [type]: numValue,
      },
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(criteria);
  };

  const handleReset = () => {
    setCriteria({});
    setCodeInput('');
    onReset();
  };

  const handleCodeInputChange = (value: string) => {
    setCodeInput(value);
    const codes = value
      .split(',')
      .map(c => c.trim())
      .filter(c => c.length > 0);
    setCriteria(prev => ({
      ...prev,
      codes: codes.length > 0 ? codes : undefined,
    }));
  };

  const handleAddFavoriteCodes = () => {
    const favoriteCodes = getFavorites();
    if (favoriteCodes.length > 0) {
      setCodeInput(favoriteCodes.join(', '));
      setCriteria(prev => ({
        ...prev,
        codes: favoriteCodes,
      }));
    }
  };

  const applyPreset = (preset: typeof PRESETS[number]) => {
    setCriteria(preset.criteria);
    setCodeInput('');
    onSearch(preset.criteria);
  };

  // アクティブな条件数をカウント
  const activeCount = [
    criteria.codes?.length,
    criteria.favoritesOnly,
    criteria.per?.min ?? criteria.per?.max,
    criteria.pbr?.min ?? criteria.pbr?.max,
    criteria.roe?.min ?? criteria.roe?.max,
    criteria.dividendYield?.min ?? criteria.dividendYield?.max,
    criteria.marketCap?.min ?? criteria.marketCap?.max,
    criteria.volume?.min ?? criteria.volume?.max,
    criteria.price?.min ?? criteria.price?.max,
  ].filter(Boolean).length;

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-md overflow-hidden">
      {/* ヘッダー（折りたたみ対応） */}
      <button
        type="button"
        className="w-full flex items-center justify-between p-4 md:p-6 hover:bg-gray-50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <h2 className="text-xl md:text-2xl font-bold">スクリーニング条件</h2>
          {activeCount > 0 && (
            <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-1 rounded-full">
              {activeCount}件設定中
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
        <div className="px-4 pb-4 md:px-6 md:pb-6 space-y-5">
          {/* プリセット条件 */}
          <div className="space-y-2">
            <Label>かんたんプリセット</Label>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => applyPreset(preset)}
                  className="px-3 py-1.5 text-sm bg-blue-50 text-blue-700 rounded-full hover:bg-blue-100 transition-colors border border-blue-200"
                  title={preset.description}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* 銘柄コード指定 */}
          <div className="space-y-2 border-t pt-4">
            <Label>銘柄コード指定（カンマ区切りで複数指定可）</Label>
            <div className="flex gap-2">
              <Input
                type="text"
                placeholder="例: 7203, 6758, 9984"
                value={codeInput}
                onChange={(e) => handleCodeInputChange(e.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleAddFavoriteCodes}
                title="お気に入り銘柄を入力欄に追加"
                className="shrink-0"
              >
                <span className="hidden sm:inline">お気に入りを追加</span>
                <span className="sm:hidden">★追加</span>
              </Button>
            </div>
          </div>

          {/* お気に入りのみ表示 */}
          <div className="border-t pt-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={criteria.favoritesOnly || false}
                onChange={(e) =>
                  setCriteria(prev => ({
                    ...prev,
                    favoritesOnly: e.target.checked || undefined,
                  }))
                }
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm font-medium">お気に入り銘柄のみ表示</span>
            </label>
          </div>

          {/* 財務指標フィルタ */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 border-t pt-4">
            <div className="space-y-2">
              <Label>
                <Tooltip text={TOOLTIPS.per}>PER（株価収益率）</Tooltip>
              </Label>
              <div className="flex gap-2">
                <Input type="number" placeholder="最小値" value={criteria.per?.min ?? ''} onChange={(e) => handleChange('per', 'min', e.target.value)} />
                <Input type="number" placeholder="最大値" value={criteria.per?.max ?? ''} onChange={(e) => handleChange('per', 'max', e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>
                <Tooltip text={TOOLTIPS.pbr}>PBR（株価純資産倍率）</Tooltip>
              </Label>
              <div className="flex gap-2">
                <Input type="number" placeholder="最小値" value={criteria.pbr?.min ?? ''} onChange={(e) => handleChange('pbr', 'min', e.target.value)} />
                <Input type="number" placeholder="最大値" value={criteria.pbr?.max ?? ''} onChange={(e) => handleChange('pbr', 'max', e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>
                <Tooltip text={TOOLTIPS.roe}>ROE（自己資本利益率）%</Tooltip>
              </Label>
              <div className="flex gap-2">
                <Input type="number" placeholder="最小値" value={criteria.roe?.min ?? ''} onChange={(e) => handleChange('roe', 'min', e.target.value)} />
                <Input type="number" placeholder="最大値" value={criteria.roe?.max ?? ''} onChange={(e) => handleChange('roe', 'max', e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>
                <Tooltip text={TOOLTIPS.dividendYield}>配当利回り（%）</Tooltip>
              </Label>
              <div className="flex gap-2">
                <Input type="number" step="0.1" placeholder="最小値" value={criteria.dividendYield?.min ?? ''} onChange={(e) => handleChange('dividendYield', 'min', e.target.value)} />
                <Input type="number" step="0.1" placeholder="最大値" value={criteria.dividendYield?.max ?? ''} onChange={(e) => handleChange('dividendYield', 'max', e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>
                <Tooltip text={TOOLTIPS.marketCap}>時価総額（億円）</Tooltip>
              </Label>
              <div className="flex gap-2">
                <Input
                  type="number" placeholder="最小値"
                  value={criteria.marketCap ? (criteria.marketCap.min ? criteria.marketCap.min / 100000000 : '') : ''}
                  onChange={(e) => handleChange('marketCap', 'min', e.target.value ? (parseFloat(e.target.value) * 100000000).toString() : '')}
                />
                <Input
                  type="number" placeholder="最大値"
                  value={criteria.marketCap ? (criteria.marketCap.max ? criteria.marketCap.max / 100000000 : '') : ''}
                  onChange={(e) => handleChange('marketCap', 'max', e.target.value ? (parseFloat(e.target.value) * 100000000).toString() : '')}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>
                <Tooltip text={TOOLTIPS.volume}>出来高（万株）</Tooltip>
              </Label>
              <div className="flex gap-2">
                <Input
                  type="number" placeholder="最小値"
                  value={criteria.volume ? (criteria.volume.min ? criteria.volume.min / 10000 : '') : ''}
                  onChange={(e) => handleChange('volume', 'min', e.target.value ? (parseFloat(e.target.value) * 10000).toString() : '')}
                />
                <Input
                  type="number" placeholder="最大値"
                  value={criteria.volume ? (criteria.volume.max ? criteria.volume.max / 10000 : '') : ''}
                  onChange={(e) => handleChange('volume', 'max', e.target.value ? (parseFloat(e.target.value) * 10000).toString() : '')}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>
                <Tooltip text={TOOLTIPS.price}>株価（円）</Tooltip>
              </Label>
              <div className="flex gap-2">
                <Input type="number" placeholder="最小値" value={criteria.price?.min ?? ''} onChange={(e) => handleChange('price', 'min', e.target.value)} />
                <Input type="number" placeholder="最大値" value={criteria.price?.max ?? ''} onChange={(e) => handleChange('price', 'max', e.target.value)} />
              </div>
            </div>
          </div>

          <div className="flex gap-3 border-t pt-4">
            <Button type="submit" className="min-w-[100px]">検索</Button>
            <Button type="button" variant="outline" onClick={handleReset}>リセット</Button>
          </div>
        </div>
      )}
    </form>
  );
}
