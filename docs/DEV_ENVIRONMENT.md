# 開発環境（Dev）での確認手順

`main` に push すると GitHub Pages（本番）へ自動デプロイされるため、**マージ前の確認は Dev 用の Firebase プロジェクト**で行います。

```
ブランチで作業 → PR を開く → GitHub Actions が Dev へデプロイ → PR にプレビューURLがコメントされる
            → 確認 OK → main にマージ → 本番（GitHub Pages）へ自動デプロイ
```

- プレビューURLは PR ごとに発行され（例: `https://attendance-system-morita-dev--pr12-abc123.web.app`）、**7日で自動失効**します
- PR に push するたびに同じ URL が更新されます
- ブランチの `firestore.rules` / `firestore.indexes.json` も Dev プロジェクトへ自動反映されるので、ルール変更も一緒に確認できます
- 本番（GitHub Pages）の仕組みは変わりません

---

## 1. 初回セットアップ（一度だけ）

### A. Dev 用 Firebase プロジェクトを作る

1. https://console.firebase.google.com/ → 「プロジェクトを追加」→ 名前: `attendance-system-morita-dev`（Google アナリティクスは不要）
2. **Web アプリを追加**（プロジェクトの設定 → マイアプリ → `</>`）→ 表示される `firebaseConfig` の値をメモ
3. **Authentication** → Sign-in method → 「メール / パスワード」を有効化
4. **Firestore Database** → データベースを作成 → ロケーション `asia-northeast1`（東京）→ 本番モードで開始
   （ルールは PR のたびに CI がリポジトリの `firestore.rules` を反映するので、ここでは触らなくて OK）
5. **Hosting** → 「始める」を押して有効化（CLI の手順は飛ばして「コンソールに進む」で OK）
6. **サービスアカウント**: プロジェクトの設定 → サービスアカウント → 「新しい秘密鍵の生成」→ JSON をダウンロード
   （GitHub Actions が Dev へデプロイするための鍵。**リポジトリには絶対に置かない**）
7. **サービスアカウントにデプロイ権限を付与**（これが無いと CI が `403 The caller does not have permission` で失敗します）
   1. https://console.cloud.google.com/iam-admin/iam?project=attendance-system-morita-dev を開く
   2. `firebase-adminsdk-xxxxx@attendance-system-morita-dev.iam.gserviceaccount.com` の行の **鉛筆アイコン（編集）**
   3. 「別のロールを追加」で次の5つを追加 → 保存
      - **Firebase Rules 管理者**（`roles/firebaserules.admin`）… firestore.rules のデプロイ
      - **Cloud Datastore インデックス管理者**（`roles/datastore.indexAdmin`）… firestore.indexes.json のデプロイ
      - **Firebase Hosting 管理者**（`roles/firebasehosting.admin`）… プレビューURLへのデプロイ
      - **Cloud Run 閲覧者**（`roles/run.viewer`）… Hosting デプロイ用アクションが参照
      - **API キー閲覧者**（`roles/serviceusage.apiKeysViewer`）… 同上
   4. 反映まで 1〜2 分かかることがあります。その後 GitHub Actions の失敗した run を「Re-run jobs」

### B. Dev 用 API キーの制限（本番と同じ考え方）

https://console.cloud.google.com/apis/credentials?project=attendance-system-morita-dev → Browser key を開く

- アプリケーションの制限: **HTTP リファラー**
  ```
  https://attendance-system-morita-dev.web.app/*
  https://attendance-system-morita-dev.firebaseapp.com/*
  https://attendance-system-morita-dev--*.web.app/*
  http://localhost:*
  ```
- API の制限: Identity Toolkit API / Cloud Firestore API

### C. GitHub Secrets を登録

リポジトリ → Settings → Secrets and variables → Actions → New repository secret

| Secret 名 | 値 |
|---|---|
| `DEV_FIREBASE_API_KEY` | A-2 でメモした `apiKey` |
| `DEV_FIREBASE_AUTH_DOMAIN` | `authDomain`（例: `attendance-system-morita-dev.firebaseapp.com`） |
| `DEV_FIREBASE_PROJECT_ID` | `projectId`（例: `attendance-system-morita-dev`） |
| `DEV_FIREBASE_STORAGE_BUCKET` | `storageBucket` |
| `DEV_FIREBASE_MESSAGING_SENDER_ID` | `messagingSenderId` |
| `DEV_FIREBASE_APP_ID` | `appId` |
| `DEV_FIREBASE_SERVICE_ACCOUNT` | A-6 の JSON ファイルの**中身を丸ごと** |
| `DEV_GOOGLE_API_KEY` / `DEV_GOOGLE_CLIENT_ID` | （任意）Google Sheets 連携を Dev でも試す場合のみ |

### D. テストデータを入れる

#### 方法1: 最小限を手で作る（15分・おすすめ）

1. Authentication → Users → 「ユーザーを追加」でテスト用アカウントを作成（例: `admin@example.com` / `staff1@example.com`）
2. Firestore に以下のドキュメントを作成

   `tenants/morita-dev`
   ```
   id: "morita-dev"
   companyName: "森田設備（Dev）"
   status: "active"
   adminEmail: "admin@example.com"
   createdAt: （タイムスタンプ）
   ```

   `global_users/admin@example.com`（ドキュメントIDはメールアドレス・小文字）
   ```
   uid: "pending-uid"
   email: "admin@example.com"
   displayName: "テスト管理者"
   role: "admin"
   tenantId: "morita-dev"
   ```
   従業員も同様に `role: "employee"` で作成。
   `uid` は `"pending-uid"` にしておくと **初回ログイン時に本物の UID へ自動で置き換わり**、`tenants/morita-dev/users/{uid}` も自動作成されます。

3. 現場・経費などは画面から登録

#### 方法2: 本番データをコピーする（リアルなデータで確認したい場合）

```bash
# 本番 → GCS にエクスポート
gcloud firestore export gs://attendance-system-morita.appspot.com/exports/$(date +%Y%m%d) --project attendance-system-morita
# Dev のバケットへコピーしてインポート
gsutil -m cp -r gs://attendance-system-morita.appspot.com/exports/YYYYMMDD gs://attendance-system-morita-dev.firebasestorage.app/exports/
gcloud firestore import gs://attendance-system-morita-dev.firebasestorage.app/exports/YYYYMMDD --project attendance-system-morita-dev
```
- Authentication のユーザーはコピーされないので、Dev 側で同じメールアドレスのアカウントを作り直します（パスワードはテスト用）
- 実在の氏名・勤怠が Dev に入るので、Dev プロジェクトへのアクセス権は社内に限定してください

---

## 2. 日々の使い方

### PR で確認する（基本）

1. ブランチを push して PR を作成（Draft でも可）
2. 数分後、GitHub の bot が PR に **「Visit the preview URL for this PR」** とコメントする
3. URL の後ろに `?tenant=<DevのテナントID>`（方法1なら `?tenant=morita-dev`）を付けて開く
4. テスト用アカウントでログインして確認
5. 問題なければ main にマージ → 本番へ自動デプロイ

### 顧客に先行して触ってもらう（UAT）

Actions → **PR Preview (Dev)** → Run workflow → ブランチを選び、channel に `uat` などを入力 → 30日間有効な固定URLが作られます（Actions のログに表示）。

### 手元の PC で動かす

```bash
cp .env.dev.example .env.dev        # 値を A-2 の firebaseConfig に書き換える
node scripts/build-config.js --env dev --local   # js/config.local.js が生成される（git には入らない）
npx serve .                          # http://localhost:3000/?tenant=morita-dev
```
`js/config.local.js` は `js/config.js` の後に読み込まれて設定を上書きするため、リポジトリの `js/config.js` を書き換える必要はありません。

---

## 3. 本番の設定も Secrets に移す（任意・推奨）

本番用の `FIREBASE_API_KEY` 〜 `FIREBASE_MEASUREMENT_ID` を Secrets に登録すると、`main` のデプロイ時に `js/config.js` が自動生成されるようになります（未登録の間はリポジトリ内の `js/config.js` がそのまま使われます）。登録して本番が問題なく動くことを確認したら、リポジトリの `js/config.js` からキーを消す PR を出してください。

---

## 4. 注意点

- **Dev と本番のデータは完全に別**です。Dev で打刻・編集しても本番には影響しません
- **EmailJS の通知先は共通**（`js/email-config.js`）のため、Dev で管理者登録依頼を送ると本番と同じメールアドレスに届きます
- Google Sheets 連携は `DEV_GOOGLE_*` を登録しない限り Dev では動きません
- Dev の Firestore ルールは **PR のブランチの内容で上書き**されます（複数 PR を同時に確認すると最後に動いた PR のルールになります）

## 5. うまくいかないとき

| 症状 | 確認すること |
|---|---|
| Actions が `DEV_FIREBASE_* の Secrets が未設定です` で失敗 | C の Secrets 名が正しいか（大文字・`DEV_` プレフィックス） |
| ログインで `auth/api-key-not-valid` | B のリファラー制限にプレビューURLのパターンが入っているか |
| `auth/unauthorized-domain` | Authentication → Settings → 承認済みドメイン にプレビューのドメインを追加 |
| Actions が `403, The caller does not have permission` で失敗 | 1-A-7 のロール付与ができているか（付与後 1〜2 分待って Re-run） |
| 画面は出るが `permission-denied` | Actions の「Deploy Firestore rules」ステップが成功しているか |
| PR にプレビューURLのコメントが付かない | Actions のログ末尾に URL が出ています（フォークからの PR では実行されません） |
