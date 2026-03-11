# Next.js キャッシュクリアスクリプト

Write-Host "Next.js キャッシュをクリアしています..."

# .next フォルダを削除
if (Test-Path .next) {
    Remove-Item -Recurse -Force .next
    Write-Host "✓ .next フォルダを削除しました"
} else {
    Write-Host "  .next フォルダは存在しません"
}

# node_modules/.cache を削除
if (Test-Path node_modules\.cache) {
    Remove-Item -Recurse -Force node_modules\.cache
    Write-Host "✓ node_modules/.cache を削除しました"
} else {
    Write-Host "  node_modules/.cache は存在しません"
}

Write-Host ""
Write-Host "キャッシュクリアが完了しました。"
Write-Host "開発サーバーを再起動してください: npm run dev"
