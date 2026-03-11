// サーバー側のメモリキャッシュ
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresIn: number; // ミリ秒
}

class MemoryCache {
  private cache: Map<string, CacheEntry<any>> = new Map();

  set<T>(key: string, data: T, expiresIn: number = 3600000): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      expiresIn,
    });
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const now = Date.now();
    const age = now - entry.timestamp;

    if (age > entry.expiresIn) {
      this.cache.delete(key);
      return null;
    }

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
}

// シングルトンインスタンス
export const memoryCache = new MemoryCache();

// キャッシュキー
export const CACHE_KEYS = {
  STOCKS: 'stocks:all',
  STOCKS_UPDATED_AT: 'stocks:updated_at',
} as const;
