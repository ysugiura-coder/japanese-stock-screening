# 本番環境デプロイ手順

## Vercelへのデプロイ（推奨）

### 方法1: Vercel CLIを使用

1. **Vercel CLIのインストール**
   ```bash
   npm install -g vercel
   ```

2. **ログイン**
   ```bash
   vercel login
   ```

3. **デプロイ**
   ```bash
   vercel
   ```
   
   初回デプロイ時は、以下の質問に答えます：
   - Set up and deploy? **Yes**
   - Which scope? **自分のアカウントを選択**
   - Link to existing project? **No**
   - Project name? **japanese-stock-screening** (または任意の名前)
   - Directory? **./** (そのままEnter)
   - Override settings? **No**

4. **本番環境へのデプロイ**
   ```bash
   vercel --prod
   ```

### 方法2: GitHub連携（推奨）

1. **GitHubリポジトリを作成**
   - GitHubで新しいリポジトリを作成
   - ローカルでGitを初期化してプッシュ
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/your-username/japanese-stock-screening.git
   git push -u origin main
   ```

2. **Vercelでプロジェクトをインポート**
   - [Vercel](https://vercel.com)にアクセス
   - 「Add New Project」をクリック
   - GitHubリポジトリを選択
   - プロジェクト設定を確認
   - 「Deploy」をクリック

3. **環境変数の設定（オプション）**
   - Vercelのプロジェクト設定で「Environment Variables」を開く
   - 必要に応じて以下を追加：
     - `JQUANTS_API_KEY`: J-Quants APIキー（使用する場合）
     - `JQUANTS_API_BASE`: J-Quants APIベースURL（デフォルト値あり）

### 方法3: Vercelダッシュボードから直接デプロイ

1. [Vercel](https://vercel.com)にログイン
2. 「Add New Project」をクリック
3. GitHubリポジトリを選択、またはZIPファイルをアップロード
4. プロジェクト設定を確認してデプロイ

## デプロイ前の確認事項

### 1. ビルドテスト

```bash
npm run build
```

エラーがないことを確認してください。

### 2. 環境変数の確認

`.env.local`ファイルはGitにコミットされませんが、Vercelの環境変数として設定する必要があります。

### 3. データソースの設定

- **モックデータ**: デフォルトで使用されます（開発・デモ用）
- **J-Quants API**: 本番環境では推奨
  - Vercelの環境変数に`JQUANTS_API_KEY`を設定
  - [J-Quants](https://jpx-jquants.com/)でアカウント作成とAPIキー取得

## デプロイ後の確認

1. **URLの確認**
   - Vercelが自動的にURLを生成します（例: `https://japanese-stock-screening.vercel.app`）

2. **動作確認**
   - アプリケーションが正常に表示されるか確認
   - スクリーニング機能が動作するか確認
   - データ取得が正常に行われるか確認

3. **カスタムドメインの設定（オプション）**
   - Vercelのプロジェクト設定で「Domains」を開く
   - カスタムドメインを追加

## トラブルシューティング

### ビルドエラーが発生する場合

1. ローカルで`npm run build`を実行してエラーを確認
2. TypeScriptの型エラーを修正
3. 依存関係を再インストール: `npm install`

### データが表示されない場合

1. ブラウザのコンソールでエラーを確認
2. Vercelのログを確認（プロジェクト設定 > Logs）
3. 環境変数が正しく設定されているか確認

### パフォーマンスの問題

1. Vercelの無料プランの制限を確認
2. キャッシュ設定を確認
3. データ取得の最適化を検討

## ランニングコスト

- **Vercel無料プラン**:
  - サーバーレス関数: 100GB時間/月
  - 帯域幅: 100GB/月
  - ビルド: 6000分/月
  - 十分な範囲内で運用可能

- **J-Quants API無料プラン**:
  - データ更新: 1日1回
  - 取得可能銘柄: 1,000銘柄まで

## セキュリティ

- APIキーは環境変数として管理（Gitにコミットしない）
- `.env.local`は`.gitignore`に含まれています
- Vercelの環境変数は暗号化されて保存されます
