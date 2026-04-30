// サーバー側のメモリキャッシュ
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresIn: number; // ミリ秒
}

class MemoryCache {
  private cache: Map<string, CacheEntry<any>> = new Map();
  // プレフィックスごとのヒット/ミス統計（キャッシュ効率の可視化用）
  private stats: Map<string, { hits: number; misses: number }> = new Map();

  private prefixOf(key: string): string {
    const idx = key.indexOf(':');
    return idx > 0 ? key.substring(0, idx) : key;
  }

  private recordHit(key: string): void {
    const p = this.prefixOf(key);
    const s = this.stats.get(p) || { hits: 0, misses: 0 };
    s.hits++;
    this.stats.set(p, s);
  }

  private recordMiss(key: string): void {
    const p = this.prefixOf(key);
    const s = this.stats.get(p) || { hits: 0, misses: 0 };
    s.misses++;
    this.stats.set(p, s);
  }

  set<T>(key: string, data: T, expiresIn: number = 3600000): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      expiresIn,
    });
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      this.recordMiss(key);
      return null;
    }

    const now = Date.now();
    const age = now - entry.timestamp;

    if (age > entry.expiresIn) {
      this.cache.delete(key);
      this.recordMiss(key);
      return null;
    }

    this.recordHit(key);
    return entry.data as T;
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  /** キャッシュ統計を取得（プレフィックス別ヒット率、合計サイズ） */
  getStats(): {
    size: number;
    byPrefix: Record<string, { hits: number; misses: number; hitRate: number }>;
    totalHits: number;
    totalMisses: number;
    totalHitRate: number;
  } {
    const byPrefix: Record<string, { hits: number; misses: number; hitRate: number }> = {};
    let totalHits = 0;
    let totalMisses = 0;
    for (const [prefix, s] of this.stats.entries()) {
      const total = s.hits + s.misses;
      byPrefix[prefix] = {
        hits: s.hits,
        misses: s.misses,
        hitRate: total > 0 ? s.hits / total : 0,
      };
      totalHits += s.hits;
      totalMisses += s.misses;
    }
    const grand = totalHits + totalMisses;
    return {
      size: this.cache.size,
      byPrefix,
      totalHits,
      totalMisses,
      totalHitRate: grand > 0 ? totalHits / grand : 0,
    };
  }
}

// シングルトンインスタンス
export const memoryCache = new MemoryCache();

// キャッシュキー
export const CACHE_KEYS = {
  STOCKS: 'stocks:all',
  STOCKS_UPDATED_AT: 'stocks:updated_at',
  EARNINGS: 'earnings', // earnings:{date} の形式で使用
  EARNINGS_UPDATED_AT: 'earnings:updated_at',
} as const;
