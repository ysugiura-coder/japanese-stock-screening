# J-Quants APIキー設定手順

## ステップ1: .env.localファイルを作成

### 方法A: エクスプローラーから作成（推奨）

1. **エクスプローラーでプロジェクトフォルダを開く**
   - `C:\Users\nextp\Desktop\国内株スクリーニング`

2. **新しいテキストファイルを作成**
   - フォルダ内で右クリック → 「新規作成」→「テキスト ドキュメント」

3. **ファイル名を変更**
   - 作成したテキストファイルを右クリック → 「名前の変更」
   - ファイル名を `.env.local` に変更
   - 警告が出たら「はい」をクリック

4. **ファイルを開いて内容を記入**
   - `.env.local`をダブルクリック（メモ帳で開く）
   - 以下の内容を記入（`YOUR_API_KEY_HERE`の部分を実際のAPIキーに置き換える）：
     ```
     JQUANTS_API_KEY=YOUR_API_KEY_HERE
     JQUANTS_API_BASE=https://api.jquants.com/v1
     ```
   - 保存（Ctrl + S）して閉じる

### 方法B: PowerShellから作成

PowerShellを開いて、以下のコマンドを実行：

```powershell
cd "C:\Users\nextp\Desktop\国内株スクリーニング"
@"
JQUANTS_API_KEY=YOUR_API_KEY_HERE
JQUANTS_API_BASE=https://api.jquants.com/v1
"@ | Out-File -FilePath .env.local -Encoding utf8
```

**重要**: `YOUR_API_KEY_HERE`の部分を実際のAPIキーに置き換えてください。

## ステップ2: 開発サーバーを再起動

`.env.local`ファイルを作成したら、開発サーバーを再起動する必要があります。

### 現在サーバーが起動している場合

1. **サーバーを停止**
   - コマンドプロンプトやPowerShellで `Ctrl + C` を押す

2. **サーバーを再起動**
   ```bash
   npm run dev
   ```
   または
   ```bash
   start-dev.bat
   ```

### サーバーが起動していない場合

```bash
npm run dev
```
または
```bash
start-dev.bat
```

## ステップ3: 動作確認

1. **ブラウザでアプリを開く**
   - http://localhost:3000 にアクセス

2. **手動更新を実行**
   - 画面右上の「手動更新」ボタンをクリック

3. **コンソールでログを確認**
   - ブラウザの開発者ツールを開く（F12キー）
   - 「Console」タブを開く
   - 以下のようなメッセージが表示されれば成功：
     ```
     Successfully fetched 1000 stocks from J-Quants API
     ```

4. **データが表示されるか確認**
   - スクリーニング画面に銘柄データが表示される
   - 画面上部に「現在のデータ: 1000銘柄」と表示される

## トラブルシューティング

### エラー: "API key is not set"
→ `.env.local`ファイルが正しく作成されているか確認
→ APIキーが正しく記入されているか確認

### エラー: "Failed to get refresh token"
→ APIキーが正しいか確認
→ J-Quantsアカウントが有効か確認

### エラー: "Rate limit exceeded"
→ API呼び出しの制限に達しています
→ 1時間待ってから再試行

### データが取得できない
→ 無料プランの制限を確認（1日1回の更新制限など）
→ コンソールのエラーメッセージを確認

## 次のステップ

APIキーが正しく設定され、データが取得できたら：

1. **スクリーニング機能を試す**
   - 各種条件で銘柄を検索

2. **お気に入り機能を試す**
   - 銘柄をクリックしてお気に入りに追加

3. **他の画面を確認**
   - PTS、決算、受注、リアルタイム画面を確認
