# 別端末から見る・サーバーに載せる手順

## 1. パブリック（同一ネットワーク）— 別端末から見る

同じ Wi‑Fi / 有線 LAN 内のスマホ・タブレット・別 PC からアクセスする方法です。

### 前提

- このアプリは **0.0.0.0** で待ち受けているため、LAN 内の他端末から接続できます。
- 開発: `npm run dev` / 本番起動: `npm run build` → `npm run start`

### 手順

1. **この PC でサーバーを起動**
   - 開発: `npm run dev`
   - 本番: `npm run build` のあと `npm run start`

2. **この PC の IP アドレスを確認**
   - **Windows**: コマンドプロンプトで `ipconfig` → 「IPv4 アドレス」を確認
   - **Mac**: ターミナルで `ifconfig | grep "inet "` または システム環境設定 → ネットワーク
   - 例: `192.168.1.10`

3. **別端末のブラウザで開く**
   - アドレス欄に `http://<上のIP>:3000` を入力
   - 例: `http://192.168.1.10:3000`

4. **つながらない場合**
   - **Windows**: 「Windows Defender ファイアウォール」→「詳細設定」→「受信の規則」で、ポート **3000** を許可する規則を追加
   - **Mac**: システム環境設定 → セキュリティとプライバシー → ファイアウォール → オプションで Node / 該当アプリを許可
   - ルーターの「AP 隔離」が有効だと同一 Wi‑Fi 内でも見えないことがあります（無効化または設定確認）

### 注意

- この PC の電源 off やスリープ、ネット切断で別端末からは見えません。
- 常時・外出先から見たい場合は、下記の「トンネル」か「サーバーに載せる」が必要です。

---

## 2. Vercel より簡単な方法 — トンネルで一時的に公開

**デプロイも Git も不要**で、今動かしているアプリに**一時的なパブリック URL** を付ける方法です。  
この PC で `npm run dev` をしたまま、もう一つコマンドを実行するだけです。

### 2-1. ngrok（手順が少なくおすすめ）

1. [ngrok](https://ngrok.com/) で無料アカウントを作成し、表示される認証トークンをコピー
2. [ngrok のダウンロード](https://ngrok.com/download) から Windows 用をダウンロードして解凍（または `choco install ngrok`）
3. この PC でアプリを起動: `npm run dev`
4. **別の**コマンドプロンプトで:
   ```bash
   ngrok config add-authtoken <あなたのトークン>
   ngrok http 3000
   ```
5. 表示された **Forwarding** の URL（例: `https://xxxx.ngrok-free.app`）を、スマホや別のネットワークのブラウザで開く

- **注意**: この PC の電源が落ちたりアプリを止めると、URL からは見えなくなります。無料プランでは URL は毎回変わります。

### 2-2. Cloudflare Quick Tunnel（アカウント不要）

1. [cloudflared のダウンロード](https://github.com/cloudflare/cloudflare-ngrok/releases) から Windows 用を取得して解凍
2. この PC でアプリを起動: `npm run dev`
3. 解凍したフォルダで:
   ```bash
   cloudflared tunnel --url http://localhost:3000
   ```
4. 表示された `https://xxxx.trycloudflare.com` をブラウザで開く

- アカウント登録なしで使えます。接続中だけ有効な URL です。

---

## 3. サーバーに載せる — 常時・本番用 URL が欲しい場合

インターネットから URL で開けるようにするには、**クラウドまたは自前サーバー**にデプロイします。

### 3-A. Vercel（本番運用・無料で開始可能）

どこからでも HTTPS の URL でアクセスできます。設定が少なく、Next.js に最適です。

| 項目 | 内容 |
|------|------|
| URL 例 | `https://japanese-stock-screening.vercel.app` |
| 料金 | 無料プランあり（利用量に応じて有料あり） |
| 詳細 | [DEPLOY.md](./DEPLOY.md) / [DEPLOY_QUICK_START.md](./DEPLOY_QUICK_START.md) を参照 |

**最短手順**

1. コードを GitHub にプッシュ
2. [vercel.com](https://vercel.com) でサインアップ（GitHub 連携が簡単）
3. 「Add New Project」→ 対象リポジトリを選択 → Deploy
4. 発行された URL がパブリックの本番 URL になります
5. J-Quants を使う場合は、Vercel の「Environment Variables」に `JQUANTS_API_KEY` などを設定

※ 認証情報はアプリ内の「設定」でブラウザに保存する方式のため、**同じブラウザでログインした人だけ**がその API キーでデータを取得します。Vercel の環境変数は、サーバー側で一括利用したい場合の補助です。

### 3-B. 自前サーバー（VPS・自宅サーバーなど）

自分で用意した Linux サーバーに載せる場合の例です。

**必要環境**

- Node.js 18 以上
- サーバーに SSH でログインできること
- 必要に応じてドメイン・リバースプロキシ（Nginx 等）

**手順例（Ubuntu など）**

```bash
# 1. リポジトリをクローン（または rsync/scp でファイルを配置）
git clone https://github.com/your-username/japanese-stock-screening.git
cd japanese-stock-screening

# 2. 依存関係インストール・ビルド
npm ci
npm run build

# 3. 本番起動（パブリックにしたい場合は 0.0.0.0 で listen）
npm run start
# または常時起動する場合:
# npm install -g pm2
# pm2 start npm --name "stock-app" -- start
# pm2 save && pm2 startup
```

- サーバーの **ファイアウォール** でポート **3000**（または利用するポート）を開放する。
- インターネットから見る場合は、**Nginx などでリバースプロキシ**をかけ、HTTPS（Let's Encrypt）を入れると安全です。
- 環境変数（J-Quants など）はサーバー上の `.env` や `export` で設定します。`.env.local` は Git に含めず、サーバーだけに置いてください。

---

## まとめ

| 目的 | 方法 | 難易度 |
|------|------|--------|
| 同じ Wi‑Fi 内の別端末から見る | この PC で `npm run dev` → 他端末で `http://<このPCのIP>:3000` | ★ いちばん簡単 |
| どこからでも一時的に URL で見る | **トンネル**（ngrok や Cloudflare）— デプロイ不要・Git 不要 | ★★ Vercel より簡単 |
| どこからでも常時 URL で見る | Vercel にデプロイ（GitHub 連携） | ★★★ |
| 自前サーバーに載せる | VPS 等で `npm run build` → `npm run start` | ★★★ |
