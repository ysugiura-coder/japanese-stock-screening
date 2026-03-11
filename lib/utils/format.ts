/**
 * 数値をフォーマット（3桁区切り）
 */
export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  return new Intl.NumberFormat('ja-JP').format(value);
}

/**
 * 金額をフォーマット（円単位）
 */
export function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  return `¥${formatNumber(value)}`;
}

/**
 * パーセンテージをフォーマット
 */
export function formatPercent(value: number | null | undefined, decimals: number = 2): string {
  if (value === null || value === undefined) return '-';
  return `${value.toFixed(decimals)}%`;
}

/**
 * 時価総額をフォーマット（億円単位）
 */
export function formatMarketCap(value: number | null | undefined): string {
  // 0 やマイナスの場合は「データなし」とみなして「-」表示にする
  // （Yahoo Finance API で marketCap が取得できないケースが多いため）
  if (value === null || value === undefined || value <= 0) return '-';
  const oku = value / 100000000; // 億円に変換
  if (oku >= 10000) {
    return `${(oku / 10000).toFixed(2)}兆円`;
  }
  return `${oku.toFixed(2)}億円`;
}

/**
 * 出来高をフォーマット
 */
export function formatVolume(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  if (value >= 1000000000) {
    return `${(value / 1000000000).toFixed(2)}億株`;
  } else if (value >= 10000) {
    return `${(value / 10000).toFixed(2)}万株`;
  }
  return formatNumber(value);
}

/**
 * 日時をフォーマット
 */
export function formatDateTime(dateString: string | undefined): string {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/**
 * CSVエクスポート用のデータ変換
 */
export function convertToCSV(data: any[]): string {
  if (data.length === 0) return '';

  const headers = Object.keys(data[0]);
  const csvRows = [
    headers.join(','),
    ...data.map(row =>
      headers.map(header => {
        const value = row[header];
        if (value === null || value === undefined) return '';
        // カンマや改行を含む場合はダブルクォートで囲む
        if (typeof value === 'string' && (value.includes(',') || value.includes('\n'))) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      }).join(',')
    ),
  ];

  return csvRows.join('\n');
}
