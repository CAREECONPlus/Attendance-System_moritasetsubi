# 勤怠管理システム

マルチテナント対応の勤怠管理システムです。

## 🚀 デモ

- **従業員画面**: https://careeconplus.github.io/Attendance-System_moritasetsubi/
- **管理者登録**: https://careeconplus.github.io/Attendance-System_moritasetsubi/admin-register.html

## 📋 機能

### 従業員機能
- ✅ 出勤・退勤打刻
- ✅ 休憩開始・終了
- ✅ 勤怠履歴確認
- ✅ テナント別データ管理

### 管理者機能
- ✅ 従業員勤怠データ管理
- ✅ 管理者登録依頼承認・却下
- ✅ テナント管理

### Super Admin機能
- ✅ 管理者登録依頼の承認・却下
- ✅ テナント作成・管理
- ✅ システム全体の管理

## 🏗️ アーキテクチャ

### マルチテナント構造
```
├── global_users/         # 全テナント横断ユーザー管理
├── admin_requests/       # 管理者登録依頼
└── tenants/
    └── {tenant-id}/
        ├── users/        # テナント内ユーザー
        ├── attendance/   # 勤怠データ
        └── breaks/       # 休憩データ
```

### 技術スタック
- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **Backend**: Firebase v8.10.1 (Authentication, Firestore) - CDN経由で読み込み
- **Hosting**: GitHub Pages
- **Email**: EmailJS

**注**: このプロジェクトはビルドステップ不要のシンプルな構成です。Firebase SDKはCDN経由で読み込むため、npm依存関係にFirebaseは含まれていません。

## 🔧 セットアップ

このプロジェクトはNode.jsのビルドステップが不要です。すべてのファイルをそのままWebサーバーにデプロイできます。

### 1. Firebase設定

#### 開発環境（ローカル）
```bash
# サンプルファイルをコピー
cp js/config.example.js js/config.js

# js/config.jsを編集して実際のFirebase設定を記述
```

#### 本番環境
環境変数を設定して自動生成：
```bash
export FIREBASE_API_KEY="your-api-key"
export FIREBASE_AUTH_DOMAIN="your-project.firebaseapp.com"
# ... その他の環境変数

npm run build:config
```

**注意**: デフォルトのconfig.jsはデモ用です。本番環境では独自のFirebaseプロジェクトを作成してください。

### 2. EmailJS設定
`js/email-config.js`のEmailJS設定値を更新
詳細は`docs/EMAIL_SETUP.md`を参照

### 3. Firestore セキュリティルール
`firestore.rules`をFirebaseコンソールにデプロイ

## 🧪 開発環境（Dev）での確認

`main` へのマージ＝本番公開なので、確認は **Dev 用 Firebase プロジェクト** で行います。

- **PR を開くと自動でプレビューURLが発行**されます（Dev プロジェクトの Hosting、7日で失効）
- 手元で動かす場合は `.env.dev` を用意して `node scripts/build-config.js --env dev --local` → `npx serve`

セットアップ手順・Secrets 一覧は [docs/DEV_ENVIRONMENT.md](docs/DEV_ENVIRONMENT.md) を参照してください。

## 📝 使用方法

### 新規管理者登録フロー
1. 管理者登録フォームから依頼送信
2. dxconsulting.branu2@gmail.com宛に通知メール送信
3. Super Adminが管理画面で承認・却下
4. 承認時に自動でテナント・アカウント作成

### ログイン
- **従業員**: `index.html?tenant={tenant-id}`
- **管理者**: `index.html?tenant={tenant-id}` (roleがadmin)
- **Super Admin**: `index.html?tenant=system` (roleがsuper_admin)

## 🔒 セキュリティ

- **Firestore Security Rules**: テナント間データ分離
- **ロールベースアクセス制御**: employee/admin/super_admin
- **クライアントサイド認証**: Firebase Authentication
- **サーバーサイド検証**: Firestore Rules
- **環境別ロギング**: 本番環境ではデバッグログを自動抑制
- **APIキー制限**: Firebase ConsoleでHTTPリファラー制限を推奨

### デバッグモード

開発時にデバッグログを有効化：
```javascript
// ブラウザコンソールで実行
logger.enableDebug()  // デバッグモード有効化
logger.disableDebug() // デバッグモード無効化
```

または URLパラメータで：
```
https://your-domain.com/?debug=true
```

## 📄 ライセンス

MIT License
