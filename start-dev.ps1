# UTF-8エンコーディングを設定
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

# プロジェクトディレクトリに移動
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptPath

Write-Host "開発サーバーを起動しています..." -ForegroundColor Green
npm run dev
