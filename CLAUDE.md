# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 開発時のスタンス（最重要）

**このツールは「株で儲けたい投資家が投資判断の参考にするための実戦ツール」である。**
機能追加・改修・バグ修正のいかなる場面でも、常に投資家目線で考えること。

### 投資家目線の判断基準
- **その情報は投資判断に直結するか？** — 単に「表示できる」ではなく、「買う／売る／様子見の意思決定に使えるか」を自問する。使えない情報はノイズ。
- **お金が絡む以上、数値の正確性は最優先** — 配当利回り・PER・時価総額・株価等は1桁違えば損失に直結する。単位（円／万円／億円、%／小数、前日比／前営業日比）・丸め・欠損値（null vs 0）の扱いは必ず明示し、疑わしい値は出さないか、注記を付ける。
- **即時性はコストを払ってでも確保すべき価値** — 決算・PTS・適時開示のような時間価値の高い情報は、キャッシュ・遅延・再取得戦略を慎重に設計する。古いデータを新鮮そうに見せるのは最悪のUX。
- **見落としは損失につながる** — 決算発表日、業績修正、保有銘柄のアラート等は「気づけなかった」が直接損益に響く。欠損時は無言で無視せず、必ずユーザーに気づかせる。
- **儲けのチャンスに気づかせる設計** — 決算サプライズ、PTS急騰落、出来高急増など「通常と違う動き」はハイライト・並び替え・通知でアクティブに提示する。受動的に並べるだけでは不十分。
- **初心者にも誤解を生まない表示** — 専門用語は補足し、指標の目安を示し、何が「良い／悪い」方向なのかが直感的に分かるようにする。投資判断を誤らせるUIは罪。
- **モバイルで完結できること** — 相場は平日日中に動く。PCの前にいない投資家でもスマホで同等の判断ができる設計を優先する。
- **リスクにも正直であること** — 高配当・割安に見える銘柄には理由があることが多い。財務健全性・業績トレンド・セクター比較など「買わない理由」も並列で見せる設計が望ましい。

### 機能を検討する際の自問リスト
1. この機能・UI改修は、ユーザーが**実際の売買判断**を下す時にどの画面で使われるか？
2. この情報が**1分遅れたら**投資家は困るか？ 困るなら更新頻度・キャッシュ戦略を再検討。
3. この数値は**他の証券アプリ／株探／Yahoo!ファイナンス**と照合して一致するか？ ズレる場合は出典と理由を明示すること。
4. **通勤中にスマホで片手操作**しても同じことができるか？
5. 保有銘柄で**損失が出る方向**のニュース・イベントを見落とさないか？

### やってはいけないこと
- 数値精度の不明なモックデータを本番同等の見た目で出す（モックなら明示する）
- 投資判断に使う画面で「エラー時は無言で0を表示」するような握りつぶし
- 表示項目の追加時に「とりあえず並べる」だけで、ソート・比較・ハイライトを設計しない
- PCでしか使えない新機能追加（モバイル対応を後回しにしない）

## プロジェクト概要

国内株式市場に特化したスクリーニング Web アプリケーション（Next.js 14 App Router + TypeScript + Tailwind CSS）。個人投資家が銘柄選定・決算チェック・PTS 動向確認を 1 つのツールで完結できることを目指す。株価は Yahoo Finance / J-Quants から、決算は EDINET API V2（XBRL 解析）から実データを取得する。

### 対象ユーザー
- ファンダメンタルズ分析ベースの個人投資家（バリュー投資家・高配当株投資家）
- 決算発表・PTS 動向を素早くチェックしたいアクティブトレーダー
- 決算サプライズ・業績修正を追うイベントドリブン型トレーダー
- スクリーニングの使い方を学びながら活用したい初心者

### 利用シーン
- **通勤中（スマホ）** — お気に入り・プリセットで即座にチェック。PTS 値動きの速報確認
- **帰宅後（PC）** — 詳細スクリーニング条件設定、決算横断比較、CSV 出力
- **決算シーズン** — EDINET から最新決算を取得し翌営業日の判断材料にする

## コマンド

```bash
npm run dev      # 開発サーバー（0.0.0.0:3000）
npm run build    # 本番ビルド
npm run start    # 本番サーバー（0.0.0.0:3000）
npm run lint     # ESLint チェック
```

## 機能ステータス

投資判断に使う時に「これは実データか？」を即座に判定できるように一覧化する。作業時はこの表を信頼し、コード側と食い違いがあれば**必ずこの表を更新する**。

| 機能 | 状態 | 実装場所 | 備考 |
|---|---|---|---|
| 株価スクリーニング | 実データ | `app/page.tsx`, `lib/api/jquants.ts` | 約 3,900 銘柄、6h キャッシュ |
| 銘柄詳細 | 実データ | `app/stocks/[code]/page.tsx` | Yahoo Finance |
| 認証設定（J-Quants + EDINET） | 実装済 | `app/settings/page.tsx` | localStorage 管理 |
| 決算データ | 実データ | `app/earnings/`, `lib/api/edinet.ts` | EDINET API + XBRL 解析、7d/1h キャッシュ |
| 決算ページの範囲選択・検索・キーボード操作 | 実装済 | `app/earnings/` | モバイル対応済 |
| お気に入り | 実装済 | `lib/utils/favorites.ts` | 単一 localStorage リスト |
| CSV エクスポート | 実装済 | `app/components/StockTable.tsx` | |
| 上場企業のみフィルタ | 実装済 | `lib/utils/screening.ts` | 銘柄名ベースで ETF/REIT 除外 |
| PTS ランキング | モック | `app/pts/` | 日次再生成 |
| リアルタイム決算（5 秒ポーリング） | モック | `app/realtime/` | ポーリング機構は実装済、データ未接続 |
| 受注データ | モック | `app/orders/` | 日付ナビゲーションのみ実装 |
| SNS 情報 | モック | `app/takapi/` | 固定アカウント 3 件 |
| お気に入りのグループ分類・複数ウォッチリスト | 未実装 | ― | |
| メイン画面のカラム選択・並び替え・レイアウト保存 | 未実装 | ― | ソート順のみ保持 |
| メイン画面のキーボードショートカット | 未実装 | ― | 決算ページのみ実装 |
| ブラウザ通知 | 未実装 | ― | |
| Web Worker / 仮想スクロール | 未実装 | ― | 依存ライブラリもなし |
| WebSocket / SSE | 未実装 | ― | 現状は HTTP ポーリング |
| 適時開示（TDnet） | 未実装 | ― | `lib/types/financial.ts` に型のみ |
| 決算サプライズのコンセンサス比較 | 未実装 | ― | |

## アーキテクチャ

### 技術スタック
- **Next.js 14.2** App Router / **React 18.3** / **TypeScript**
- **Tailwind CSS 3.4** / shadcn 風 UI プリミティブ（`app/components/ui/`）
- **@tanstack/react-query 5** — サーバ状態管理
- **date-fns** — 日付処理
- **jszip** — EDINET XBRL の ZIP 展開
- **lucide-react** — アイコン

### ディレクトリ構成

```
app/
  api/
    stocks/route.ts              # 株価データ取得（GET）
    update/route.ts              # 強制更新（POST）
    earnings/route.ts            # 決算データ取得（GET）
    edinet-doc/[docId]/route.ts  # EDINET 書類プロキシ（GET）
  components/                    # 共通コンポーネント
    ui/                          # shadcn 風プリミティブ
  (各ページディレクトリ)          # /, /earnings, /pts, /realtime, /orders, /takapi, /settings, /stocks/[code]
lib/
  api/
    cache.ts                     # TTL 付きインメモリキャッシュ
    jquants.ts                   # フォールバックチェーン制御
    jquants-implementation.ts    # J-Quants V1
    jquants-v2.ts                # J-Quants V2
    yahoo-finance.ts             # Yahoo Finance Screener
    edinet.ts                    # EDINET API V2 + XBRL 解析
  data/
    mock-earnings.ts             # 決算モックデータ（5 年分）
  types/
    stock.ts                     # Stock, ScreeningCriteria, StocksResponse
    financial.ts                 # FinancialSummary, EarningsData, PTSData, OrderData, SegmentPerformance
  utils/
    screening.ts                 # フィルタ・ソート・isListedCompany 判定
    favorites.ts                 # localStorage お気に入り管理
    format.ts                    # 金額・%・大きな数の整形
    cn.ts                        # Tailwind クラス結合
```

パスエイリアス：`@/*` → プロジェクトルート（`tsconfig.json`）。

### ページ構成

| ルート | 機能 | テーマ | データ |
|---|---|---|---|
| `/` | 株式スクリーニング（メイン） | Light | 実データ |
| `/stocks/[code]` | 銘柄詳細 | Light | 実データ |
| `/settings` | 認証設定（J-Quants + EDINET） | Light | ― |
| `/earnings` | 決算データ（範囲選択・有報対応・検索） | Dark | **実データ（EDINET）** |
| `/pts` | PTS ランキング | Dark | モック |
| `/realtime` | リアルタイム決算（5 秒ポーリング） | Dark | モック |
| `/orders` | 受注データ | Dark | モック |
| `/takapi` | SNS 情報（旧たかぴー） | Dark | モック |

全ページコンポーネントは `'use client'` ディレクティブを使用。

### API ルート

| ルート | メソッド | 用途 | データソース | 認証ヘッダ |
|---|---|---|---|---|
| `/api/stocks` | GET | キャッシュ済み株価 | J-Quants V1/V2 → Yahoo → モック | `x-jquants-email`, `x-jquants-password`, `x-jquants-api-key`, `x-api-base` |
| `/api/update` | POST | キャッシュクリア＋再取得 | 同上 | 同上 |
| `/api/earnings?date=YYYY-MM-DD&source=edinet\|mock` | GET | 決算データ | EDINET API V2 or モック | `x-edinet-api-key` |
| `/api/edinet-doc/[docId]?type=1\|2\|5` | GET | EDINET 書類プロキシ（XBRL/PDF/CSV） | EDINET API V2 | `x-edinet-api-key` |

- `/api/stocks` は `?clearCache=true` でキャッシュバイパス
- CORS は全ルートで `Access-Control-Allow-Origin: *`
- EDINET 関連ルートは XBRL 解析の CPU コストのため `maxDuration = 60`（秒）を設定

### データソースとフォールバック

**株価系** — `lib/api/jquants.ts` が優先順位でデータソースを切替：

1. **J-Quants V1**（`jquants-implementation.ts`）— メール／パスワード認証
2. **J-Quants V2**（`jquants-v2.ts`）— API キー認証
3. **Yahoo Finance**（`yahoo-finance.ts`）— 無料、約 3,900 銘柄、crumb/cookie 認証
4. **モックデータ** — 10 銘柄ハードコード（`getMockStocks()`）

**決算系** — `lib/api/edinet.ts` が **EDINET API V2** から取得。XBRL を `jszip` で展開し、目的要素を抽出。モックは `lib/data/mock-earnings.ts`（5 年分・多四半期）。EDINET 失敗時にモックへ自動フォールバックしない設計（誤情報より欠損）。

### キャッシュ戦略

`lib/api/cache.ts` の TTL 付きインメモリシングルトン。**サーバー再起動で消失する**。

| 用途 | TTL | 経路 |
|---|---|---|
| 株価（全銘柄） | 6 時間 | `/api/stocks` |
| 決算（過去日） | 7 日 | `/api/earnings` |
| 決算（当日） | 1 時間 | `/api/earnings` |
| EDINET 書類本体 | `edinet.ts` 内実装参照 | XBRL 再取得抑制 |

### クライアント状態管理

- **React Query** — クエリキー `['stocks']` など、`staleTime: 1分`、`refetchOnWindowFocus: false`。設定は `app/providers.tsx`
- **localStorage** — 認証情報（`jquants_*`, `edinet_*`）、お気に入り（`stock-screening-favorites`）、表示件数設定、スクリーニング設定
- 全ページは `'use client'` ディレクティブ

### データフロー

**株価系**
```
app/page.tsx → fetchStocks()（認証ヘッダ）
  → GET /api/stocks
    → jquants.ts フォールバックチェーン → Stock[]
    → memoryCache（6h TTL）
  → クライアント側フィルタ（lib/utils/screening.ts）
  → StockTable（ソート・ページネーション・CSV）
```

**決算系**
```
app/earnings/page.tsx → fetch /api/earnings?date=...&source=edinet
  → edinet.ts（認証 → 書類一覧 → XBRL 並列取得 maxConcurrent=20）
    → jszip 展開 → 要素抽出 → FinancialSummary
    → memoryCache（過去日 7d / 当日 1h）
  → クライアント側フィルタ・検索・範囲選択
```

### 主要型定義

- **`Stock`**（`lib/types/stock.ts`）— code, name, market, price, marketCap, volume, per, pbr, roe, dividendYield, updatedAt
- **`ScreeningCriteria`** — 各指標のフィルタ範囲 + `favoritesOnly` + `listedOnly`
- **`StocksResponse`** — `{ stocks, total, updatedAt }`
- **`FinancialSummary`**（`lib/types/financial.ts`）— XBRL 抽出フィールド（売上高・営業利益・純利益・進捗率 等）
- **`EarningsData`**, **`PTSData`**, **`OrderData`**, **`SegmentPerformance`**（`lib/types/financial.ts`）

## データソース別の実装上の注意点

### Yahoo Finance
- `lang=ja-JP&region=JP` パラメータがないと英語の銘柄名が返る
- Screener API の配当利回りは既に % 形式（2.74 = 2.74%）。100 倍変換しない
- ROE は提供されないため `EPS / BookValue` から算出
- 小型株の時価総額データは信頼性が低い
- `quoteType: 'EQUITY'` 指定で ETF/REIT は元々除外される

### J-Quants V1（メール／パスワード）
- Google ログインのみのアカウントは不可（パスワード未設定）
- `listed/info` は ETF・REIT・インフラファンドを含む。`isListedCompany()`（`lib/utils/screening.ts`）で銘柄名ベースで除外

### J-Quants V2（API キー）
- 株価・出来高のみ提供。**PER・PBR・ROE・配当利回りは取得不可**
- サブスクリプション期限を超えた日付で 400 が返った場合は、エラーメッセージから終了日を抽出して再試行

### EDINET API V2
- ベース URL は直近コミット（`d489982`）で修正済み。変更時は `lib/api/edinet.ts` を参照
- API キーは金融庁 EDINET の設定画面から取得し、`/settings` ページで入力
- 書類取得は `jszip` で ZIP 展開、XBRL からタクソノミ要素を抽出
- 並列取得数 `maxConcurrent=20`
- Vercel 関数タイムアウト 60 秒が前提
- **EDINET 取得失敗時にモックへ自動フォールバックしない**。投資判断における原則として誤情報より欠損・明示エラーを優先する

### 認証情報の取り扱い
- 全てクライアント側 localStorage に保存され、リクエストヘッダ経由でサーバに渡る
- サーバ側は環境変数（`JQUANTS_EMAIL`, `JQUANTS_PASSWORD`, `JQUANTS_API_KEY`, `JQUANTS_API_BASE`）もフォールバックとして読む
- **キーはレスポンスボディ・ログに出さないこと**

## デプロイ設定（Vercel）

- リージョン: **`hnd1`**（東京・羽田）※ `vercel.json`
- 関数タイムアウト: `/api/earnings`, `/api/edinet-doc/[docId]` は `maxDuration = 60` 秒
- セキュリティヘッダ（`next.config.mjs`）: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, XSS-Protection, Referrer-Policy
- 画像最適化: `images.unoptimized: true`
- CORS: 全 API ルートで `Access-Control-Allow-Origin: *`

## ロードマップ

### 着手中
- EDINET 統合の安定化・XBRL 抽出フィールド拡充
- 決算ページの UX 改善（範囲選択・有報対応・モバイル・検索・キーボード操作は完了済）

### 未着手（優先順位順）
1. PTS データの実データ接続（SBI / ジャパンネクスト PTS）
2. 適時開示（TDnet）接続
3. 決算サプライズのコンセンサス比較
4. 受注データの実データ接続（各社 IR）
5. お気に入りのグループ分類・複数ウォッチリスト
6. メイン画面のカラム選択・並び替え・レイアウト保存
7. ブラウザ通知（決算日・急騰落・業績修正アラート）
8. Web Worker / 仮想スクロールによるフィルタ高速化
9. WebSocket / SSE リアルタイム配信基盤
