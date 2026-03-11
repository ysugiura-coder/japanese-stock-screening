'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';

const EMAIL_STORAGE_KEY = 'jquants_email';
const PASSWORD_STORAGE_KEY = 'jquants_password';
const API_KEY_STORAGE_KEY = 'jquants_api_key';
const AUTH_METHOD_STORAGE_KEY = 'jquants_auth_method';
const API_BASE_STORAGE_KEY = 'jquants_api_base';

type AuthMethod = 'email' | 'apikey';

export default function SettingsPage() {
  const [authMethod, setAuthMethod] = useState<AuthMethod>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiBase, setApiBase] = useState('https://api.jquants.com/v1');
  
  // 認証方式が変更されたときにAPI Baseを自動調整
  const handleAuthMethodChange = (newMethod: AuthMethod) => {
    setAuthMethod(newMethod);
    // APIキー方式の場合はv2を推奨（ただし、既にv2が設定されている場合は変更しない）
    if (newMethod === 'apikey' && !apiBase.includes('/v2')) {
      setApiBase('https://api.jquants.com/v2');
    } else if (newMethod === 'email' && !apiBase.includes('/v1')) {
      setApiBase('https://api.jquants.com/v1');
    }
  };
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // 保存されている認証情報を読み込む
    if (typeof window !== 'undefined') {
      const savedAuthMethod = (localStorage.getItem(AUTH_METHOD_STORAGE_KEY) || 'email') as AuthMethod;
      const savedEmail = localStorage.getItem(EMAIL_STORAGE_KEY) || '';
      const savedPassword = localStorage.getItem(PASSWORD_STORAGE_KEY) || '';
      const savedApiKey = localStorage.getItem(API_KEY_STORAGE_KEY) || '';
      const savedApiBase = localStorage.getItem(API_BASE_STORAGE_KEY) || 'https://api.jquants.com/v1';
      setAuthMethod(savedAuthMethod);
      setEmail(savedEmail);
      setPassword(savedPassword);
      setApiKey(savedApiKey);
      setApiBase(savedApiBase);
    }
  }, []);

  const handleSave = () => {
    if (authMethod === 'email') {
      if (!email.trim()) {
        setError('メールアドレスを入力してください');
        return;
      }
      if (!password.trim()) {
        setError('パスワードを入力してください');
        return;
      }
    } else {
      if (!apiKey.trim()) {
        setError('APIキーを入力してください');
        return;
      }
    }

    try {
      // localStorageに保存
      localStorage.setItem(AUTH_METHOD_STORAGE_KEY, authMethod);
      if (authMethod === 'email') {
        localStorage.setItem(EMAIL_STORAGE_KEY, email.trim());
        localStorage.setItem(PASSWORD_STORAGE_KEY, password.trim());
      } else {
        localStorage.setItem(API_KEY_STORAGE_KEY, apiKey.trim());
      }
      localStorage.setItem(API_BASE_STORAGE_KEY, apiBase.trim());
      setSaved(true);
      setError('');
      
      // 3秒後にメッセージを消す
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      setError('保存に失敗しました');
      console.error('Failed to save credentials:', error);
    }
  };

  const handleClear = () => {
    if (confirm('認証情報を削除しますか？')) {
      localStorage.removeItem(AUTH_METHOD_STORAGE_KEY);
      localStorage.removeItem(EMAIL_STORAGE_KEY);
      localStorage.removeItem(PASSWORD_STORAGE_KEY);
      localStorage.removeItem(API_KEY_STORAGE_KEY);
      localStorage.removeItem(API_BASE_STORAGE_KEY);
      setAuthMethod('email');
      setEmail('');
      setPassword('');
      setApiKey('');
      setApiBase('https://api.jquants.com/v1');
      setSaved(false);
      setError('');
    }
  };

  const handleTest = async () => {
    if (authMethod === 'email') {
      if (!email.trim()) {
        setError('メールアドレスを入力してください');
        return;
      }
      if (!password.trim()) {
        setError('パスワードを入力してください');
        return;
      }
    } else {
      if (!apiKey.trim()) {
        setError('APIキーを入力してください');
        return;
      }
    }

    try {
      setError('');
      
      // 保存してからテスト
      localStorage.setItem(AUTH_METHOD_STORAGE_KEY, authMethod);
      if (authMethod === 'email') {
        localStorage.setItem(EMAIL_STORAGE_KEY, email.trim());
        localStorage.setItem(PASSWORD_STORAGE_KEY, password.trim());
      } else {
        localStorage.setItem(API_KEY_STORAGE_KEY, apiKey.trim());
      }
      localStorage.setItem(API_BASE_STORAGE_KEY, apiBase.trim());

      // 実際のAPIテストは手動更新で確認
      alert('認証情報を保存しました。\n「手動更新」ボタンでデータ取得をテストしてください。');
    } catch (error) {
      setError('テストに失敗しました');
      console.error('Failed to test credentials:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <h1 className="text-3xl font-bold text-gray-900">設定</h1>
          <p className="mt-2 text-gray-600">J-Quants APIキーの設定</p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow-md p-6 space-y-6">
          <div>
            <h2 className="text-xl font-bold mb-4">データソース設定</h2>
            <p className="text-sm text-gray-600 mb-6">
              現在、<strong>Yahoo Finance API</strong>がデフォルトで使用されています（設定不要、無料）。
              <br />
              より多くの銘柄（最大1,000銘柄）を取得したい場合は、J-Quants APIの設定も可能です（オプション）。
            </p>
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
              <p className="text-sm font-semibold text-green-900 mb-2">✓ 現在のデータソース: Yahoo Finance API</p>
              <p className="text-xs text-green-800 mb-2">
                アプリは現在<strong>Yahoo Finance API</strong>を使用してデータを取得しています。
                <br />
                <strong>無料で利用可能</strong>で、設定不要です。
              </p>
              <p className="text-xs text-green-800 mb-2">
                Yahoo Finance APIは約50銘柄の主要銘柄データを提供します。
                <br />
                より多くの銘柄が必要な場合は、J-Quants APIの設定も可能です（オプション）。
              </p>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <p className="text-sm font-semibold text-blue-900 mb-2">📌 J-Quants API（オプション）</p>
              <p className="text-xs text-blue-800 mb-2">
                J-Quants APIには<strong>Version 1</strong>と<strong>Version 2</strong>があります。
                <br />
                <strong>最大1,000銘柄</strong>を取得したい場合に設定してください。
              </p>
              <ul className="list-disc list-inside space-y-1 text-xs text-blue-800 ml-2 mb-2">
                <li><strong>Version 1</strong>: メールアドレス/パスワード方式（従来の方式）</li>
                <li><strong>Version 2</strong>: APIキー方式（推奨・優先的に使用されます）</li>
              </ul>
              <p className="text-xs text-blue-800 mb-2">
                <strong>✓ 1000銘柄取得機能</strong>: ページネーション機能により、最大1,000銘柄まで確実に取得できます。
                <br />
                APIキーが設定されている場合は、自動的にVersion 2が優先的に使用されます。
              </p>
              <p className="text-xs text-blue-800 mb-2">
                <strong>注意</strong>: J-Quants APIは設定が不要ではありません。設定しない場合は、Yahoo Finance APIが使用されます。
              </p>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
              <p className="text-sm font-semibold text-amber-900 mb-2">⚠ メール/パスワード（Version 1）で「&apos;mailaddress&apos; or &apos;password&apos; is incorrect.」が出る場合</p>
              <p className="text-xs text-amber-800 mb-2">
                <strong>Version 1は「J-Quantsにメールアドレスで登録した」アカウントのパスワードのみ有効です。</strong>
                Googleでログインしているだけの場合は、J-Quants側にパスワードが存在しないため、この方式では認証できません。
              </p>
              <ul className="list-disc list-inside space-y-1 text-xs text-amber-800 ml-2 mb-2">
                <li>上記の場合は<strong>認証方式で「APIキー（Version 2）」を選び</strong>、J-Quantsサイト（マイページ）で発行したAPIキーを入力してください</li>
                <li>メールで登録している場合: パスワードの typo・前後の空白に注意し、J-Quants公式サイトでログインできるか確認してください</li>
              </ul>
            </div>
          </div>

          {saved && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded">
              <p className="font-semibold">✓ 認証情報を保存しました</p>
              <p className="text-sm mt-1">「手動更新」ボタンでデータを取得してください。</p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              <p className="font-semibold">エラー</p>
              <p className="text-sm mt-1">{error}</p>
            </div>
          )}

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="auth-method">認証方式 *</Label>
              <select
                id="auth-method"
                value={authMethod}
                onChange={(e) => handleAuthMethodChange(e.target.value as AuthMethod)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="apikey">APIキー（Version 2 - 推奨）</option>
                <option value="email">メールアドレス/パスワード（Version 1）</option>
              </select>
              <p className="text-xs text-gray-500">
                Version 2のAPIキー方式を推奨します
              </p>
            </div>

            {authMethod === 'apikey' ? (
              <div className="space-y-2">
                <Label htmlFor="api-key">APIキー *</Label>
                <Input
                  id="api-key"
                  type="password"
                  placeholder="your_api_key_here"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="font-mono"
                />
                <p className="text-xs text-gray-500">
                  J-Quantsダッシュボードから取得したAPIキーを入力してください
                  <br />
                  <a
                    href="https://jpx-jquants.com/dashboard/api-keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    J-Quants APIダッシュボード
                  </a>
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="email">メールアドレス *</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="your_email@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <p className="text-xs text-gray-500">
                    J-Quantsアカウントのメールアドレスを入力してください
                    <br />
                    <span className="text-blue-600">Googleアカウント認証の場合: Googleアカウントのメールアドレスを使用</span>
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">パスワード *</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="your_password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <p className="text-xs text-gray-500">
                    J-Quantsアカウントのパスワードを入力してください
                    <br />
                    <span className="text-blue-600">Googleアカウント認証の場合:</span>
                    <br />
                    <span className="text-yellow-600">• 2段階認証が無効: Googleアカウントのパスワード</span>
                    <br />
                    <span className="text-yellow-600">• 2段階認証が有効: アプリパスワード（Googleアカウントのセキュリティ設定で生成）</span>
                  </p>
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label htmlFor="api-base">APIベースURL</Label>
              <Input
                id="api-base"
                type="text"
                placeholder="https://api.jquants.com/v1"
                value={apiBase}
                onChange={(e) => setApiBase(e.target.value)}
              />
              <p className="text-xs text-gray-500">
                通常は変更する必要はありません
              </p>
            </div>
          </div>

          <div className="flex gap-4 pt-4 border-t">
            <Button onClick={handleSave}>保存</Button>
            <Button onClick={handleTest} variant="outline">
              保存してテスト
            </Button>
            <Button onClick={handleClear} variant="outline">
              削除
            </Button>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-semibold text-blue-900 mb-2">使い方</h3>
            <ol className="list-decimal list-inside space-y-2 text-sm text-blue-800">
              <li>J-Quantsアカウントを作成（無料）</li>
              <li>上記のフォームにメールアドレスとパスワードを入力</li>
              <li>「保存」ボタンをクリック</li>
              <li>「手動更新」ボタンをクリックしてデータ取得をテスト</li>
              <li>データが取得できるか確認</li>
            </ol>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <h3 className="font-semibold text-yellow-900 mb-2">注意事項</h3>
            <ul className="list-disc list-inside space-y-1 text-sm text-yellow-800">
              <li>認証情報はブラウザのlocalStorageに保存されます</li>
              <li>他のブラウザやデバイスでは別途設定が必要です</li>
              <li>パスワードは他人に共有しないでください</li>
              <li>無料プランでは1,000銘柄まで取得可能です</li>
              <li>API呼び出し制限: 1時間あたり100回</li>
            </ul>
          </div>
        </div>
      </main>
    </div>
  );
}
