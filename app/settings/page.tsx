'use client';

import { useState, useEffect } from 'react';

const EMAIL_KEY = 'jquants_email';
const PASSWORD_KEY = 'jquants_password';
const APIKEY_KEY = 'jquants_api_key';
const AUTH_METHOD_KEY = 'jquants_auth_method';
const API_BASE_KEY = 'jquants_api_base';

type AuthMethod = 'email' | 'apikey';

export default function SettingsPage() {
  const [mounted, setMounted] = useState(false);
  const [authMethod, setAuthMethod] = useState<AuthMethod>('apikey');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiBase, setApiBase] = useState('https://api.jquants.com/v1');

  const [jquantsSaved, setJquantsSaved] = useState(false);
  const [jquantsError, setJquantsError] = useState('');

  useEffect(() => {
    try {
      setAuthMethod((localStorage.getItem(AUTH_METHOD_KEY) as AuthMethod) || 'apikey');
      setEmail(localStorage.getItem(EMAIL_KEY) || '');
      setPassword(localStorage.getItem(PASSWORD_KEY) || '');
      setApiKey(localStorage.getItem(APIKEY_KEY) || '');
      setApiBase(localStorage.getItem(API_BASE_KEY) || 'https://api.jquants.com/v1');
    } catch { /* ignore */ }
    setMounted(true);
  }, []);

  function saveJquants() {
    setJquantsError('');
    if (authMethod === 'email') {
      if (!email.trim()) { setJquantsError('メールアドレスを入力してください'); return; }
      if (!password.trim()) { setJquantsError('パスワードを入力してください'); return; }
    } else {
      if (!apiKey.trim()) { setJquantsError('J-Quants V2 の APIキーを入力してください'); return; }
    }
    try {
      localStorage.setItem(AUTH_METHOD_KEY, authMethod);
      if (authMethod === 'email') {
        localStorage.setItem(EMAIL_KEY, email.trim());
        localStorage.setItem(PASSWORD_KEY, password.trim());
      } else {
        localStorage.setItem(APIKEY_KEY, apiKey.trim());
      }
      localStorage.setItem(API_BASE_KEY, apiBase.trim());
      setJquantsSaved(true);
      setTimeout(() => setJquantsSaved(false), 3000);
    } catch {
      setJquantsError('保存に失敗しました');
    }
  }

  async function testJquants() {
    setJquantsError('');
    if (authMethod !== 'apikey' || !apiKey.trim()) {
      setJquantsError('決算データ（TDnet）の接続テストには APIキー方式が必要です。先にAPIキーを保存してください。');
      saveJquants();
      return;
    }
    try {
      localStorage.setItem(APIKEY_KEY, apiKey.trim());
      const today = new Date();
      const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const res = await fetch(`/api/earnings?date=${dateStr}&source=tdnet`, {
        headers: { 'x-jquants-api-key': apiKey.trim() },
      });
      const data = await res.json();
      if (res.ok) {
        alert(`J-Quants TDnet 接続成功！ ${data.total}件の決算短信を取得しました。\n決算ページで確認してください。`);
        setJquantsSaved(true);
        setTimeout(() => setJquantsSaved(false), 3000);
      } else {
        setJquantsError(`接続エラー: ${data.error || res.statusText}`);
      }
    } catch (e) {
      setJquantsError(`接続テストに失敗: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  function clearJquants() {
    if (!confirm('J-Quants認証情報を削除しますか？')) return;
    [AUTH_METHOD_KEY, EMAIL_KEY, PASSWORD_KEY, APIKEY_KEY, API_BASE_KEY].forEach(k => localStorage.removeItem(k));
    setAuthMethod('apikey');
    setEmail('');
    setPassword('');
    setApiKey('');
    setApiBase('https://api.jquants.com/v1');
    setJquantsSaved(false);
    setJquantsError('');
  }

  if (!mounted) {
    return (
      <div className="min-h-screen bg-gray-100">
        <header className="bg-white shadow-sm">
          <div className="max-w-7xl mx-auto px-4 py-6">
            <h1 className="text-3xl font-bold text-gray-900">設定</h1>
            <p className="mt-2 text-gray-600">APIキーとデータソースの設定</p>
          </div>
        </header>
        <main className="max-w-4xl mx-auto px-4 py-8">
          <p className="text-gray-500">読み込み中...</p>
        </main>
      </div>
    );
  }

  const inputClass = 'w-full h-10 px-3 py-2 text-sm border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500';
  const btnPrimary = 'h-10 px-4 rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500';
  const btnOutline = 'h-10 px-4 rounded-md text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500';
  const labelClass = 'block text-sm font-medium text-gray-700 mb-1';

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <h1 className="text-3xl font-bold text-gray-900">設定</h1>
          <p className="mt-2 text-gray-600">APIキーとデータソースの設定</p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-8">

        {/* ===== J-Quants カード ===== */}
        <section className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-2">J-Quants API（株価＋決算データ）</h2>
          <p className="text-sm text-gray-600 mb-4">
            株価スクリーニング（メイン画面）と決算データ（TDnet 決算短信、決算ページ）の両方で使います。
          </p>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 space-y-1">
            <p className="text-sm font-semibold text-blue-900">設定方法（J-Quants API V2）</p>
            <ul className="text-xs text-blue-800 list-disc list-inside space-y-0.5">
              <li>J-Quants <a href="https://jpx-jquants.com/" target="_blank" rel="noopener noreferrer" className="underline">マイページ</a>のダッシュボードで APIキーを発行</li>
              <li>下のフォームに貼り付け、「保存」または「保存して TDnet 接続テスト」</li>
              <li>2025-12-22 以降の登録アカウントは V2 のみ利用可（V1 のメール/パスワードは不可）</li>
              <li>決算データ（<code>/v2/fins/summary</code>）は契約プランによって利用可否が変わります。403 が出る場合はプランをご確認ください</li>
            </ul>
          </div>

          {jquantsSaved && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded mb-4">
              <p className="text-sm font-semibold">保存しました</p>
            </div>
          )}
          {jquantsError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
              <p className="text-sm">{jquantsError}</p>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="auth-method" className={labelClass}>認証方式</label>
              <select
                id="auth-method"
                value={authMethod}
                onChange={(e) => {
                  const v = e.target.value as AuthMethod;
                  setAuthMethod(v);
                  setApiBase('https://api.jquants.com/v1');
                }}
                className={inputClass}
              >
                <option value="apikey">APIキー（V2 ダッシュボード発行・推奨）</option>
                <option value="email">メールアドレス/パスワード（V1 旧アカウント）</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                決算データ取得（TDnet）には V2 APIキー方式が必須です。
              </p>
            </div>

            {authMethod === 'apikey' ? (
              <div>
                <label htmlFor="jq-apikey" className={labelClass}>APIキー（V2） *</label>
                <input
                  id="jq-apikey"
                  type="password"
                  placeholder="J-Quants ダッシュボードで発行した APIキー"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className={`${inputClass} font-mono`}
                />
              </div>
            ) : (
              <>
                <div>
                  <label htmlFor="jq-email" className={labelClass}>メールアドレス *</label>
                  <input
                    id="jq-email"
                    type="email"
                    placeholder="your_email@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="jq-password" className={labelClass}>パスワード *</label>
                  <input
                    id="jq-password"
                    type="password"
                    placeholder="your_password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </>
            )}

            <div>
              <label htmlFor="jq-base" className={labelClass}>APIベースURL</label>
              <input
                id="jq-base"
                type="text"
                value={apiBase}
                onChange={(e) => setApiBase(e.target.value)}
                className={inputClass}
              />
              <p className="text-xs text-gray-500 mt-1">通常は変更不要です（v1 を使用）</p>
            </div>
          </div>

          <div className="flex gap-3 mt-6 pt-4 border-t">
            <button type="button" onClick={saveJquants} className={btnPrimary}>保存</button>
            <button type="button" onClick={testJquants} className={btnOutline}>保存してTDnet接続テスト</button>
            <button type="button" onClick={clearJquants} className={btnOutline}>削除</button>
          </div>
        </section>

        {/* ===== ヘルプ ===== */}
        <section className="bg-white rounded-lg shadow-md p-6 space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-semibold text-blue-900 mb-2">使い方</h3>
            <ol className="list-decimal list-inside space-y-1 text-sm text-blue-800">
              <li>J-Quants マイページでアカウント作成・APIキー（リフレッシュトークン）発行</li>
              <li>上のフォームにAPIキーを入力して「保存」をクリック</li>
              <li>「保存してTDnet接続テスト」で決算データの取得を確認</li>
              <li>各ページ（スクリーニング、決算）でデータが表示されることを確認</li>
            </ol>
          </div>
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <h3 className="font-semibold text-yellow-900 mb-2">注意事項</h3>
            <ul className="list-disc list-inside space-y-1 text-sm text-yellow-800">
              <li>認証情報はブラウザのlocalStorageに保存されます</li>
              <li>他のブラウザやデバイスでは別途設定が必要です</li>
              <li>APIキーは他人に共有しないでください</li>
              <li>V2 APIキーはダッシュボード上で再発行・失効できます。漏洩した可能性がある場合は速やかに再発行してください</li>
            </ul>
          </div>
        </section>
      </main>
    </div>
  );
}
