@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo Gitセットアップを開始します...
echo.

echo 1. Gitのユーザー情報を設定してください
echo    現在の設定を確認:
git config user.name
git config user.email
echo.

echo 2. ユーザー名とメールアドレスを設定する場合は、以下を実行してください:
echo    git config user.name "Your Name"
echo    git config user.email "your.email@example.com"
echo.

echo 3. Gitリポジトリを初期化...
git init
echo.

echo 4. ファイルを追加...
git add .
echo.

echo 5. 初回コミット...
git commit -m "Initial commit"
echo.

echo セットアップが完了しました！
echo.
echo 次のステップ:
echo 1. GitHubでリポジトリを作成
echo 2. 以下のコマンドで接続:
echo    git remote add origin https://github.com/your-username/japanese-stock-screening.git
echo    git branch -M main
echo    git push -u origin main
echo.

pause
