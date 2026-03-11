@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 開発サーバーを起動しています...
npm run dev
pause
