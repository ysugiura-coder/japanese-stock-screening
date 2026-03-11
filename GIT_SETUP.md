# Gitセットアップ手順

## 1. Gitのユーザー情報を設定

プロジェクトフォルダで以下のコマンドを実行してください：

```bash
git config user.name "Your Name"
git config user.email "your.email@example.com"
```

または、グローバルに設定する場合：

```bash
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"
```

## 2. プロジェクトフォルダに移動

```bash
cd "C:\Users\nextp\Desktop\国内株スクリーニング"
```

## 3. Gitリポジトリの初期化（まだの場合）

```bash
git init
```

## 4. ファイルを追加

```bash
git add .
```

## 5. 初回コミット

```bash
git commit -m "Initial commit"
```

## 6. GitHubリポジトリと接続

既存のリモートを削除してから追加：

```bash
git remote remove origin
git remote add origin https://github.com/your-username/japanese-stock-screening.git
```

## 7. プッシュ

```bash
git branch -M main
git push -u origin main
```

## トラブルシューティング

### エラー: "remote origin already exists"

```bash
git remote remove origin
git remote add origin https://github.com/your-username/japanese-stock-screening.git
```

### エラー: "Permission denied"

`.gitignore`に`AppData/`が追加されているので、再度`git add .`を実行してください。

### エラー: "package.jsonが見つからない"

プロジェクトフォルダに移動していることを確認：

```bash
cd "C:\Users\nextp\Desktop\国内株スクリーニング"
```
