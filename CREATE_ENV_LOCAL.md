# .env.localファイルの作成方法

## 方法1: エクスプローラーから作成（最も簡単）

1. **エクスプローラーでプロジェクトフォルダを開く**
   - `C:\Users\nextp\Desktop\国内株スクリーニング`

2. **新しいテキストファイルを作成**
   - フォルダ内の空いている場所で右クリック
   - 「新規作成」→「テキスト ドキュメント」を選択

3. **ファイル名を変更**
   - ファイル名を `.env.local` に変更
   - 拡張子を削除（`.txt`を削除）
   - 警告が出たら「はい」をクリック

4. **ファイルを開いて内容を記入**
   - `.env.local`をダブルクリック（メモ帳で開く）
   - 以下の内容を記入：
     ```
     JQUANTS_API_KEY=your_api_key_here
     JQUANTS_API_BASE=https://api.jquants.com/v1
     ```
   - `your_api_key_here`の部分を実際のAPIキーに置き換える
   - 保存して閉じる

## 方法2: コマンドプロンプトから作成

1. **コマンドプロンプトを開く**
   - Win + R → `cmd` → Enter

2. **プロジェクトフォルダに移動**
   ```cmd
   cd "C:\Users\nextp\Desktop\国内株スクリーニング"
   ```

3. **ファイルを作成**
   ```cmd
   echo JQUANTS_API_KEY=your_api_key_here > .env.local
   echo JQUANTS_API_BASE=https://api.jquants.com/v1 >> .env.local
   ```

## 方法3: PowerShellから作成

1. **PowerShellを開く**
   - Win + X → 「Windows PowerShell」を選択

2. **プロジェクトフォルダに移動**
   ```powershell
   cd "C:\Users\nextp\Desktop\国内株スクリーニング"
   ```

3. **ファイルを作成**
   ```powershell
   @"
   JQUANTS_API_KEY=your_api_key_here
   JQUANTS_API_BASE=https://api.jquants.com/v1
   "@ | Out-File -FilePath .env.local -Encoding utf8
   ```

## 方法4: エディタから作成

1. **VS CodeやCursorなどのエディタを開く**
   - プロジェクトフォルダを開く

2. **新しいファイルを作成**
   - ファイル名: `.env.local`

3. **内容を記入**
   ```
   JQUANTS_API_KEY=your_api_key_here
   JQUANTS_API_BASE=https://api.jquants.com/v1
   ```

4. **保存**

## 注意事項

### ファイル名について
- ファイル名は **`.env.local`** （先頭にドット）
- 拡張子は不要（`.txt`などは付けない）
- Windowsでは「ファイル名を変更」で `.env.local` と入力

### ファイルが見えない場合
Windowsでは、ドットで始まるファイルは隠しファイルとして扱われる場合があります。

**表示方法:**
1. エクスプローラーの「表示」タブを開く
2. 「隠しファイル」にチェックを入れる

### 内容の記入例

実際のAPIキーを取得したら、以下のように記入：

```
JQUANTS_API_KEY=abc123xyz789
JQUANTS_API_BASE=https://api.jquants.com/v1
```

### セキュリティについて
- `.env.local`は`.gitignore`に含まれているため、Gitにコミットされません
- APIキーは他人に共有しないでください
- 本番環境（Vercelなど）では、環境変数として設定してください

## 確認方法

ファイルが正しく作成されたか確認：

```cmd
dir .env.local
```

または

```powershell
Test-Path .env.local
```

`True`と表示されれば、ファイルが存在します。

## トラブルシューティング

### 「ファイル名を変更できません」と表示される
→ ファイルが開いている可能性があります。すべてのエディタを閉じてから再試行してください。

### ファイルが見つからない
→ プロジェクトフォルダ（`C:\Users\nextp\Desktop\国内株スクリーニング`）に作成されているか確認してください。

### エンコーディングエラー
→ ファイルをUTF-8エンコーディングで保存してください（VS CodeやCursorでは自動的にUTF-8になります）。
