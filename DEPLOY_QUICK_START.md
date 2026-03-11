# クイックスタート: Vercelへのデプロイ

## 最短手順（5分）

### 1. GitHubにプッシュ（まだの場合）

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/your-username/japanese-stock-screening.git
git push -u origin main
```

### 2. Vercelでデプロイ

1. [vercel.com](https://vercel.com)にアクセス
2. 「Sign Up」でGitHubアカウントでログイン
3. 「Add New Project」をクリック
4. リポジトリを選択
5. 設定を確認（そのままでOK）
6. 「Deploy」をクリック

### 3. 完了！

数分でデプロイが完了します。自動的にURLが生成されます。

例: `https://japanese-stock-screening.vercel.app`

## オプション: 環境変数の設定

J-Quants APIを使用する場合のみ：

1. Vercelのプロジェクト設定を開く
2. 「Environment Variables」を選択
3. 以下を追加：
   - Key: `JQUANTS_API_KEY`
   - Value: あなたのAPIキー

## トラブルシューティング

**ビルドエラーが出る場合:**
```bash
npm run build
```
をローカルで実行してエラーを確認してください。
