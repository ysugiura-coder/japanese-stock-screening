'use client';

import { useState, useEffect, useCallback } from 'react';

interface XAccount {
  handle: string; // @username
  displayName: string;
  addedAt: string;
}

interface SNSPost {
  accountHandle: string;
  accountName: string;
  content: string;
  date: string;
  category: 'stock' | 'market' | 'strategy' | 'info';
}

// デフォルトアカウント
const defaultAccounts: XAccount[] = [
  { handle: '@stock_unknown', displayName: 'たかぴー', addedAt: '2026-01-01' },
];

// モック投稿データ生成（アカウントに基づく）
function generateMockPosts(accounts: XAccount[]): SNSPost[] {
  const now = new Date();
  const formatDate = (daysAgo: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() - daysAgo);
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
  };

  const posts: SNSPost[] = [];

  if (accounts.some(a => a.handle === '@stock_unknown')) {
    posts.push(
      { accountHandle: '@stock_unknown', accountName: 'たかぴー', content: '日経平均は本日も堅調。半導体関連が特に強い展開。東京エレクトロン(8035)、アドバンテスト(6857)に注目。', date: formatDate(0), category: 'market' },
      { accountHandle: '@stock_unknown', accountName: 'たかぴー', content: 'トヨタ自動車(7203)の3Q決算、セグメント別で金融事業が+18.7%と好調。自動車本体も堅実な成長。', date: formatDate(0), category: 'stock' },
      { accountHandle: '@stock_unknown', accountName: 'たかぴー', content: '決算シーズンの戦略：サプライズ銘柄のPTS動向を確認してから翌営業日に判断。焦って飛びつかないこと。', date: formatDate(1), category: 'strategy' },
      { accountHandle: '@stock_unknown', accountName: 'たかぴー', content: 'ソニーG(6758)のイメージング＆センシング部門の利益YoY+42.8%が光る。CMOSセンサー需要は引き続き旺盛。', date: formatDate(1), category: 'stock' },
      { accountHandle: '@stock_unknown', accountName: 'たかぴー', content: '三菱UFJ(8306)のグローバルCB部門+45.2%。金利上昇局面でメガバンクの収益力が際立つ。', date: formatDate(2), category: 'stock' },
    );
  }

  if (accounts.some(a => a.handle === '@kabutan_jp')) {
    posts.push(
      { accountHandle: '@kabutan_jp', accountName: '株探', content: '【本日の決算発表】15:00〜 主要企業の決算が集中。注目は半導体・自動車セクター。', date: formatDate(0), category: 'info' },
      { accountHandle: '@kabutan_jp', accountName: '株探', content: '【PTS速報】河西工業(7256)がPTSで+37.5%の急騰。中期経営計画を好感。', date: formatDate(0), category: 'market' },
    );
  }

  if (accounts.some(a => a.handle === '@naborin555')) {
    posts.push(
      { accountHandle: '@naborin555', accountName: 'なぼりん', content: '高配当株ポートフォリオの配当利回りが4.2%に到達。KDDI、JT、三菱商事が中心。', date: formatDate(0), category: 'strategy' },
      { accountHandle: '@naborin555', accountName: 'なぼりん', content: '信越化学(4063)の業績修正に注意。半導体材料の需要は底堅いが、市況に左右される面も。', date: formatDate(1), category: 'stock' },
    );
  }

  // 登録されたその他のアカウント用のジェネリック投稿
  accounts.forEach(account => {
    if (!['@stock_unknown', '@kabutan_jp', '@naborin555'].includes(account.handle)) {
      posts.push({
        accountHandle: account.handle,
        accountName: account.displayName || account.handle,
        content: `${account.handle} の最新投稿を取得中...（実データ接続後に表示されます）`,
        date: formatDate(0),
        category: 'info',
      });
    }
  });

  return posts.sort((a, b) => b.date.localeCompare(a.date));
}

const STORAGE_KEY = 'sns-info-accounts';

export default function SNSInfoPage() {
  const [accounts, setAccounts] = useState<XAccount[]>(defaultAccounts);
  const [posts, setPosts] = useState<SNSPost[]>([]);
  const [newHandle, setNewHandle] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [filterAccount, setFilterAccount] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  // localStorageから復元
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as XAccount[];
        if (parsed.length > 0) setAccounts(parsed);
      }
    } catch { /* ignore */ }
  }, []);

  // アカウント変更時にlocalStorageへ保存 & 投稿を再生成
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
    setPosts(generateMockPosts(accounts));
  }, [accounts]);

  // 5分間隔で自動更新
  const refresh = useCallback(() => {
    setPosts(generateMockPosts(accounts));
    setLastUpdated(new Date());
  }, [accounts]);

  useEffect(() => {
    const interval = setInterval(refresh, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [refresh]);

  // アカウント追加
  const addAccount = () => {
    let handle = newHandle.trim();
    if (!handle) return;
    if (!handle.startsWith('@')) handle = '@' + handle;
    // 英数字とアンダースコアのみ許可
    if (!/^@[a-zA-Z0-9_]+$/.test(handle)) return;
    if (accounts.some(a => a.handle === handle)) return;

    setAccounts(prev => [...prev, {
      handle,
      displayName: newDisplayName.trim() || handle,
      addedAt: new Date().toISOString().split('T')[0],
    }]);
    setNewHandle('');
    setNewDisplayName('');
  };

  // アカウント削除
  const removeAccount = (handle: string) => {
    setAccounts(prev => prev.filter(a => a.handle !== handle));
  };

  // フィルタ済み投稿
  const filteredPosts = posts.filter(p => {
    if (filterAccount !== 'all' && p.accountHandle !== filterAccount) return false;
    if (filterCategory !== 'all' && p.category !== filterCategory) return false;
    return true;
  });

  const getCategoryBadge = (cat: string) => {
    switch (cat) {
      case 'stock': return <span className="px-1.5 py-0.5 rounded text-xs bg-blue-500/20 text-blue-400">銘柄</span>;
      case 'market': return <span className="px-1.5 py-0.5 rounded text-xs bg-green-500/20 text-green-400">市場</span>;
      case 'strategy': return <span className="px-1.5 py-0.5 rounded text-xs bg-yellow-500/20 text-yellow-400">戦略</span>;
      case 'info': return <span className="px-1.5 py-0.5 rounded text-xs bg-gray-500/20 text-gray-400">情報</span>;
      default: return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* ヘッダー */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">SNS情報</h1>
          <div className="flex items-center gap-3 text-sm text-gray-400">
            <span>更新: {lastUpdated.toLocaleString('ja-JP')}</span>
            <button
              onClick={refresh}
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-white"
            >
              更新
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* 左サイドバー: アカウント管理 */}
          <div className="lg:col-span-1 space-y-4">
            {/* アカウント追加 */}
            <div className="bg-gray-800 rounded-lg p-4">
              <h2 className="text-sm font-semibold mb-3">Xアカウント追加</h2>
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="@username"
                  value={newHandle}
                  onChange={(e) => setNewHandle(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addAccount()}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-sm text-white placeholder-gray-500"
                />
                <input
                  type="text"
                  placeholder="表示名（省略可）"
                  value={newDisplayName}
                  onChange={(e) => setNewDisplayName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addAccount()}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-sm text-white placeholder-gray-500"
                />
                <button
                  onClick={addAccount}
                  className="w-full px-3 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm font-medium"
                >
                  追加
                </button>
              </div>
            </div>

            {/* 登録アカウント一覧 */}
            <div className="bg-gray-800 rounded-lg p-4">
              <h2 className="text-sm font-semibold mb-3">登録アカウント ({accounts.length})</h2>
              <div className="space-y-2">
                {accounts.map((account) => (
                  <div key={account.handle} className="flex items-center justify-between bg-gray-700 rounded px-3 py-2">
                    <div>
                      <a
                        href={`https://x.com/${account.handle.slice(1)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-400 hover:underline"
                      >
                        {account.handle}
                      </a>
                      {account.displayName && account.displayName !== account.handle && (
                        <span className="text-xs text-gray-400 ml-2">{account.displayName}</span>
                      )}
                    </div>
                    <button
                      onClick={() => removeAccount(account.handle)}
                      className="text-gray-500 hover:text-red-400 text-xs"
                    >
                      x
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* フィルター */}
            <div className="bg-gray-800 rounded-lg p-4">
              <h2 className="text-sm font-semibold mb-3">フィルター</h2>
              <div className="space-y-2">
                <div>
                  <label className="text-xs text-gray-400">アカウント</label>
                  <select
                    value={filterAccount}
                    onChange={(e) => setFilterAccount(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-sm text-white mt-1"
                  >
                    <option value="all">すべて</option>
                    {accounts.map(a => (
                      <option key={a.handle} value={a.handle}>{a.displayName || a.handle}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400">カテゴリ</label>
                  <select
                    value={filterCategory}
                    onChange={(e) => setFilterCategory(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-sm text-white mt-1"
                  >
                    <option value="all">すべて</option>
                    <option value="stock">銘柄</option>
                    <option value="market">市場</option>
                    <option value="strategy">戦略</option>
                    <option value="info">情報</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* メインコンテンツ: 投稿一覧 */}
          <div className="lg:col-span-3 space-y-3">
            {filteredPosts.length === 0 ? (
              <div className="bg-gray-800 rounded-lg p-8 text-center text-gray-400">
                投稿がありません。Xアカウントを追加してください。
              </div>
            ) : (
              filteredPosts.map((post, idx) => (
                <div key={idx} className="bg-gray-800 rounded-lg p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <a
                        href={`https://x.com/${post.accountHandle.slice(1)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-semibold text-blue-400 hover:underline"
                      >
                        {post.accountName}
                      </a>
                      <span className="text-xs text-gray-500">{post.accountHandle}</span>
                      {getCategoryBadge(post.category)}
                    </div>
                    <span className="text-xs text-gray-500">{post.date}</span>
                  </div>
                  <p className="text-sm text-gray-200 leading-relaxed">{post.content}</p>
                </div>
              ))
            )}

            {/* フッター */}
            <div className="text-xs text-gray-500 text-center pt-2">
              5分間隔で自動更新 / 実データはXAPI接続後に利用可能
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
