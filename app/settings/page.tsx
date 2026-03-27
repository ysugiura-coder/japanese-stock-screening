'use client';

import { useState, useEffect } from 'react';

const EMAIL_KEY = 'jquants_email';
const PASSWORD_KEY = 'jquants_password';
const APIKEY_KEY = 'jquants_api_key';
const AUTH_METHOD_KEY = 'jquants_auth_method';
const API_BASE_KEY = 'jquants_api_base';
const EDINET_KEY = 'edinet_api_key';

type AuthMethod = 'email' | 'apikey';

export default function SettingsPage() {
  const [mounted, setMounted] = useState(false);
  const [authMethod, setAuthMethod] = useState<AuthMethod>('apikey');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiBase, setApiBase] = useState('https://api.jquants.com/v2');
  const [edinetApiKey, setEdinetApiKey] = useState('');

  const [jquantsSaved, setJquantsSaved] = useState(false);
  const [jquantsError, setJquantsError] = useState('');
  const [edinetSaved, setEdinetSaved] = useState(false);
  const [edinetError, setEdinetError] = useState('');

  // クライアントマウント後にlocalStorageから読み込み
  useEffect(() => {
    try {
      setAuthMethod((localStorage.getItem(AUTH_METHOD_KEY) as AuthMethod) || 'apikey');
      setEmail(localStorage.getItem(EMAIL_KEY) || '');
      setPassword(localStorage.getItem(PASSWORD_KEY) || '');
      setApiKey(localStorage.getItem(APIKEY_KEY) || '');
      setApiBase(localStorage.getItem(API_BASE_KEY) || 'https://api.jquants.com/v2');
      setEdinetApiKey(localStorage.getItem(EDINET_KEY) || '');
    } catch { /* ignore */ }
    setMounted(true);
  }, []);

  // ===== J-Quants =====
  function saveJquants() {
    setJquantsError('');
    if (authMethod === 'email') {
      if (!email.trim()) { setJquantsError('メールアドレスを入力してください'); return; }
      if (!password.trim()) { setJquantsError('パスワードを入力してください'); return; }
    } else {
      if (!apiKey.trim()) { setJquantsError('APIキーを入力してください'); return; }
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

  function testJquants() {
    saveJquants();
    if (!jquantsError) {
      alert('認証情報を保存しました。\nトップページの「手動更新」ボタンでデータ取得をテストしてください。');
    }
  }

  function clearJquants() {
    if (!confirm('J-Quants認証情報を削除しますか？')) return;
    [AUTH_METHOD_KEY, EMAIL_KEY, PASSWORD_KEY, APIKEY_KEY, API_BASE_KEY].forEach(k => localStorage.removeItem(k));
    setAuthMethod('apikey');
    setEmail('');
    setPassword('');
    setApiKey('');
    setApiBase('https://api.jquants.com/v2');
    setJquantsSaved(false);
    setJquantsError('');
  }

  // ===== EDINET =====
  function saveEdinet() {
    setEdinetError('');
    if (!edinetApiKey.trim()) {
      setEdinetError('EDINET APIキーを入力してください');
      return;
    }
    try {
      localStorage.setItem(EDINET_KEY, edinetApiKey.trim());
      setEdinetSaved(true);
      setTimeout(() => setEdinetSaved(false), 3000);
    } catch {
      setEdinetError('保存に失敗しました');
    }
  }

  async function testEdinet() {
    setEdinetError('');
    if (!edinetApiKey.trim()) {
      setEdinetError('EDINET APIキーを入力してください');
      return;
    }
    try {
      localStorage.setItem(EDINET_KEY, edinetApiKey.trim());
      const now = new Date();
      const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const res = await fetch(`/api/earnings?date=${dateStr}&source=edinet`, {
        headers: { 'x-edinet-api-key': edinetApiKey.trim() },
      });
      const data = await res.json();
      if (res.ok) {
        alert(`EDINET接続成功！ ${data.total}件の書類を取得しました。\n決算ページで確認してください。`);
        setEdinetSaved(true);
        setTimeout(() => setEdinetSaved(false), 3000);
      } else {
        setEdinetError(`接続エラー: ${data.error || res.statusText}`);
      }
    } catch (e) {
      setEdinetError(`接続テストに失敗: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  function clearEdinet() {
    if (!confirm('EDINET APIキーを削除しますか？')) return;
    localStorage.removeItem(EDINET_KEY);
    setEdinetApiKey('');
    setEdinetError('');
    setEdinetSaved(false);
  }

  // マウント前は何も表示しない（hydrationずれ防止）
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
          <h2 className="text-xl font-bold text-gray-900 mb-2">株価データソース（J-Quants API）</h2>
          <p className="text-sm text-gray-600 mb-4">
            デフォルトはYahoo Finance API（無料・設定不要）。より多くの銘柄を取得したい場合はJ-Quantsを設定してください。
          </p>

          <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4">
            <p className="text-sm font-semibold text-green-900">現在: Yahoo Finance API（設定不要・無料）</p>
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
                  if (v === 'apikey') setApiBase('https://api.jquants.com/v2');
                  else setApiBase('https://api.jquants.com/v1');
                }}
                className={inputClass}
              >
                <option value="apikey">APIキー（Version 2 - 推奨）</option>
                <option value="email">メールアドレス/パスワード（Version 1）</option>
              </select>
            </div>

            {authMethod === 'apikey' ? (
              <div>
                <label htmlFor="jq-apikey" className={labelClass}>APIキー *</label>
                <input
                  id="jq-apikey"
                  type="password"
                  placeholder="your_api_key_here"
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
              <p className="text-xs text-gray-500 mt-1">通常は変更不要です</p>
            </div>
          </div>

          <div className="flex gap-3 mt-6 pt-4 border-t">
            <button type="button" onClick={saveJquants} className={btnPrimary}>保存</button>
            <button type="button" onClick={testJquants} className={btnOutline}>保存してテスト</button>
            <button type="button" onClick={clearJquants} className={btnOutline}>削除</button>
          </div>
        </section>

        {/* ===== EDINET カード ===== */}
        <section className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-2">決算データソース（EDINET API）</h2>

          <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4">
            <p className="text-sm font-semibold text-green-900 mb-1">EDINET API V2（無料）</p>
            <p className="text-xs text-green-800">
              金融庁EDINETのAPIで有価証券報告書・四半期報告書・決算短信の実データを取得します。
              決算ページ（/earnings）に反映されます。
            </p>
          </div>

          {edinetSaved && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded mb-4">
              <p className="text-sm font-semibold">EDINET APIキーを保存しました</p>
            </div>
          )}
          {edinetError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
              <p className="text-sm">{edinetError}</p>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="edinet-key" className={labelClass}>EDINET APIキー (Subscription-Key) *</label>
              <input
                id="edinet-key"
                type="password"
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                value={edinetApiKey}
                onChange={(e) => setEdinetApiKey(e.target.value)}
                className={`${inputClass} font-mono`}
              />
              <p className="text-xs text-gray-500 mt-1">
                <a href="https://disclosure.edinet-fsa.go.jp" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                  EDINET公式サイト
                </a>
                でユーザー登録後にAPIキーを取得できます。
              </p>
            </div>
          </div>

          <div className="flex gap-3 mt-6 pt-4 border-t">
            <button type="button" onClick={saveEdinet} className={btnPrimary}>保存</button>
            <button type="button" onClick={testEdinet} className={btnOutline}>接続テスト</button>
            <button type="button" onClick={clearEdinet} className={btnOutline}>削除</button>
          </div>
        </section>

        {/* ===== ヘルプ ===== */}
        <section className="bg-white rounded-lg shadow-md p-6 space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-semibold text-blue-900 mb-2">使い方</h3>
            <ol className="list-decimal list-inside space-y-1 text-sm text-blue-800">
              <li>各APIのアカウントを作成しAPIキーを取得（いずれも無料）</li>
              <li>フォームにAPIキーを入力して「保存」をクリック</li>
              <li>「接続テスト」でデータ取得を確認</li>
              <li>各ページ（スクリーニング、決算）でデータが表示されることを確認</li>
            </ol>
          </div>
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <h3 className="font-semibold text-yellow-900 mb-2">注意事項</h3>
            <ul className="list-disc list-inside space-y-1 text-sm text-yellow-800">
              <li>認証情報はブラウザのlocalStorageに保存されます</li>
              <li>他のブラウザやデバイスでは別途設定が必要です</li>
              <li>APIキーは他人に共有しないでください</li>
            </ul>
          </div>
        </section>
      </main>
    </div>
  );
}
